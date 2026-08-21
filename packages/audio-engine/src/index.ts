import type AudioClock from "@web-audio/clock";
import type { Midi } from "@web-audio/midi";
import type { BankSchema, DromeSchema, SamplerSchema } from "@web-audio/schema";
import { lfoProcessorSource } from "@web-audio/worklets";
import RuntimeBus from "./buses/runtime-bus";
import { validateConstantBusEffects } from "./buses/resolve-constant-audio-param";
import Sampler from "./instruments/sampler";
import Synthesizer from "./instruments/synthesizer";
import MidiOutputScheduler from "./midi-output-scheduler";
import { registerWorklets } from "./utils/register-worklets";
import { preloadVariationIndices } from "./utils/preload-variations";
import { resolveSampleUrl } from "./utils/resolve-sample-entry";

type RuntimeInstrument = Synthesizer | Sampler;

interface RuntimeGraph {
  instruments: RuntimeInstrument[];
  buses: Map<string, RuntimeBus>;
}

class AudioEngine {
  private _ctx: AudioContext;
  private _clock: AudioClock;
  private _master: GainNode;
  private _analyser: AnalyserNode;
  private _activeGraph: RuntimeGraph = { instruments: [], buses: new Map() };
  // Retiring instruments retain their original buses until every voice in that
  // committed graph has finished.
  private _retiringGraphs = new Set<RuntimeGraph>();
  // Last-write-wins: if update() is called multiple times before the next
  // prebar fires, only the most recent schema is committed. Earlier schemas
  // are intentionally discarded — in a live coding context, only the latest
  // user intent should take effect.
  private _pending: DromeSchema | null = null;
  private _midi: Midi | null = null;
  private _midiOutputScheduler: MidiOutputScheduler;
  private _unsub: Set<() => void>;
  // Two-level cache: resolved for synchronous access in _commit(), promises
  // for deduplicating concurrent fetches across instruments and commits.
  private _cache = {
    resolved: new Map<string, AudioBuffer>(),
    promises: new Map<string, Promise<AudioBuffer | null>>(),
    reversed: new WeakMap<AudioBuffer, AudioBuffer>(),
  };
  readonly ready: Promise<void>;

  constructor(ctx: AudioContext, clock: AudioClock) {
    this._ctx = ctx;
    this._clock = clock;
    this._master = ctx.createGain();
    this._analyser = ctx.createAnalyser();
    this._master.connect(ctx.destination);
    this._master.connect(this._analyser);
    this._midiOutputScheduler = new MidiOutputScheduler(clock);

    this.ready = registerWorklets(this._ctx, [lfoProcessorSource]);

    this._unsub = new Set([
      clock.on("prebar", ({ bar }, time) => this._commit(bar, time)),
      clock.on("bar", ({ bar }, time) => {
        this._activeGraph.instruments.forEach((instrument) =>
          instrument.scheduleBar(bar, time),
        );
      }),
      clock.on("stop", () => {
        this._activeGraph.instruments.forEach((instrument) =>
          instrument.cancelFutureNotes(),
        );
        this._retiringGraphs.forEach((graph) =>
          graph.instruments.forEach((instrument) =>
            instrument.cancelFutureNotes(),
          ),
        );
        this._midiOutputScheduler.stop();
      }),
    ]);
  }

  update(schema: DromeSchema): void {
    const buses = schema.buses;
    for (const [name, bus] of Object.entries(buses)) {
      if (name === "" || name !== name.trim()) {
        throw new Error(`[AudioEngine] Bus name "${name}" is not canonical.`);
      }
      if (!Number.isFinite(bus.gain) || bus.gain < 0) {
        throw new Error(
          `[AudioEngine] Bus "${name}" gain must be a finite number greater than or equal to 0.`,
        );
      }
      if (name === "main" && bus.effects.length > 0) {
        throw new Error(
          "[AudioEngine] Effects on main are not supported in the bus MVP.",
        );
      }
      validateConstantBusEffects(bus.effects, name);
    }
    schema.instruments.forEach((instrument, index) => {
      const route = instrument.route;
      if (route === "" || route !== route.trim()) {
        throw new Error(
          `[AudioEngine] Instrument ${index} route "${route}" is not canonical.`,
        );
      }
      if (route !== "main" && !buses[route]) {
        throw new Error(
          `[AudioEngine] Instrument ${index} route "${route}" does not reference a declared bus.`,
        );
      }
      for (const [target, amount] of Object.entries(instrument.sends)) {
        if (target === "" || target !== target.trim()) {
          throw new Error(
            `[AudioEngine] Instrument ${index} send target "${target}" is not canonical.`,
          );
        }
        if (target === "main") {
          throw new Error(
            `[AudioEngine] Instrument ${index} send cannot target main.`,
          );
        }
        if (!buses[target]) {
          throw new Error(
            `[AudioEngine] Instrument ${index} send "${target}" does not reference a declared bus.`,
          );
        }
        if (!Number.isFinite(amount) || amount < 0 || amount > 1) {
          throw new Error(
            `[AudioEngine] Instrument ${index} send "${target}" amount must be a finite number in [0, 1].`,
          );
        }
      }
    });
    this._pending = schema;
  }

  connectMidi(midi: Midi) {
    if (this._midi === midi) return;
    this.disconnectMidi();
    this._midi = midi;
    this._midiOutputScheduler.connect(midi);
    this._activeGraph.instruments.forEach((instrument) =>
      instrument.connectMidi(midi),
    );
  }

  disconnectMidi() {
    if (!this._midi) return;
    this._activeGraph.instruments.forEach((instrument) =>
      instrument.disconnectMidi(),
    );
    this._retiringGraphs.forEach((graph) =>
      graph.instruments.forEach((instrument) => instrument.disconnectMidi()),
    );
    this._midiOutputScheduler.disconnect();
    this._midi = null;
  }

  // Pre-loads all sampler buffers into the cache before the clock starts.
  // Does NOT create instruments — instrument creation (with LFO init) happens in
  // _commit() where startingBar and barStartTime are known.
  async prepare(): Promise<void> {
    if (!this._pending) return;
    const { instruments, banks } = this._pending;

    const urls = new Set<string>();
    for (const schema of instruments) {
      if (schema.type !== "sampler") continue;
      for (const sourceKey of schema.sourceKeys) {
        for (const varIndex of preloadVariationIndices(schema)) {
          const url = this._resolveUrl(schema, banks, sourceKey, varIndex);
          if (url) urls.add(url);
        }
      }
    }

    const loads = Array.from(urls).map((url) => {
      if (!this._cache.promises.has(url)) {
        this._cache.promises.set(
          url,
          fetch(url)
            .then((r) => r.arrayBuffer())
            .then((b) => this._ctx.decodeAudioData(b))
            .catch(() => {
              console.warn(`[Sampler] Failed to pre-load ${url}`);
              this._cache.promises.delete(url);
              return null;
            }),
        );
      }
      return this._cache.promises.get(url)!.then((buffer) => {
        if (buffer) this._cache.resolved.set(url, buffer);
      });
    });

    await Promise.all(loads);
  }

  private _commit(upcomingBar = 0, barStartTime?: number): void {
    if (!this._pending) return;

    if (this._pending.bpm !== undefined) {
      this._clock.bpm(this._pending.bpm);
    }

    const pending = this._pending;
    const buses = new Map<string, RuntimeBus>();
    const instruments: RuntimeInstrument[] = [];
    const previousMainGain = this._master.gain.value;
    this._master.gain.value = pending.buses.main?.gain ?? 1;
    try {
      for (const [name, schema] of Object.entries(pending.buses)) {
        if (name === "main") continue;
        buses.set(name, new RuntimeBus(this._ctx, name, schema, this._master));
      }

      for (const [index, schema] of pending.instruments.entries()) {
        const route = schema.route;
        const destination =
          route === "main" ? this._master : buses.get(route)!.input;
        const routing = {
          primary: destination,
          sends: Object.entries(schema.sends).map(([target, amount]) => ({
            destination: buses.get(target)!.input,
            amount,
          })),
        };
        let instrument: RuntimeInstrument;
        if (schema.type === "sampler") {
          instrument = new Sampler(this._ctx, this._clock, {
            schema,
            destination,
            routing,
            banks: pending.banks,
            cache: this._cache,
            startingBar: upcomingBar,
            barStartTime,
            fallbackBuffer: this._fallbackBufferFor(schema, index),
          });
          // load() hits _cache.resolved synchronously if prepare() ran.
          void instrument.load();
        } else {
          instrument = new Synthesizer(this._ctx, this._clock, {
            schema,
            destination,
            routing,
            startingBar: upcomingBar,
            barStartTime,
            midiOutputScheduler: this._midiOutputScheduler,
          });
        }
        if (this._midi) instrument.connectMidi(this._midi);
        instruments.push(instrument);
      }
    } catch (error) {
      instruments.forEach((instrument) => instrument.destroy());
      buses.forEach((bus) => bus.destroy());
      this._master.gain.value = previousMainGain;
      throw error;
    }

    const oldGraph = this._activeGraph;
    this._activeGraph = { instruments, buses };
    this._pending = null;
    this._retire(oldGraph);
  }

  private _retire(graph: RuntimeGraph) {
    if (graph.instruments.length === 0 && graph.buses.size === 0) return;
    this._retiringGraphs.add(graph);
    graph.instruments.forEach((instrument) => instrument.retire());
    void Promise.all(
      graph.instruments.map((instrument) => instrument.finished),
    ).then(() => {
      if (!this._retiringGraphs.delete(graph)) return;
      graph.instruments.forEach((instrument) => instrument.destroy());
      graph.buses.forEach((bus) => bus.destroy());
    });
  }

  private _fallbackBufferFor(
    schema: SamplerSchema,
    index: number,
  ): AudioBuffer | null {
    const previous = this._activeGraph.instruments[index];
    if (!(previous instanceof Sampler)) return null;
    return previous.fallbackBufferFor(schema);
  }

  private _resolveUrl(
    schema: SamplerSchema,
    banks: Record<string, BankSchema>,
    sourceKey: number,
    variationIndex: number,
  ): string | null {
    return resolveSampleUrl({
      banks,
      bank: schema.bank,
      sample: schema.sample,
      sourceKey,
      variationIndex,
    });
  }

  getAnalyser(): AnalyserNode {
    return this._analyser;
  }

  destroy(): void {
    this._unsub.forEach((fn) => fn());
    this.disconnectMidi();
    this._midiOutputScheduler.destroy();
    this._activeGraph.instruments.forEach((instrument) => instrument.destroy());
    this._activeGraph.buses.forEach((bus) => bus.destroy());
    this._retiringGraphs.forEach((graph) => {
      graph.instruments.forEach((instrument) => instrument.destroy());
      graph.buses.forEach((bus) => bus.destroy());
    });
    this._activeGraph = { instruments: [], buses: new Map() };
    this._retiringGraphs.clear();
    this._pending = null;
    this._master.disconnect();
    this._analyser.disconnect();
  }
}

export default AudioEngine;
