import type { DuckTrigger } from "./buses/duck-automation";
import type { EngineClock } from "./engine-clock";
import type { Midi } from "@web-audio/midi";
import { validateDromeGraph } from "@web-audio/schema";
import type { DromeSchema } from "@web-audio/schema";
import {
  lfoProcessorSource,
  noiseProcessorSource,
  supersawProcessorSource,
} from "@web-audio/worklets";
import RuntimeBus from "./buses/runtime-bus";
import { DEFAULT_BPM } from "./constants";
import Sampler from "./instruments/sampler";
import SampleBufferCache from "./samples/sample-buffer-cache";
import Synthesizer from "./instruments/synthesizer";
import MidiOutputScheduler from "./midi/midi-output-scheduler";
import { registerWorklets } from "./worklets/register-worklets";
import { planSamplerPreloads } from "./samples/preload-samples";

type RuntimeInstrument = Synthesizer | Sampler;

function cleanupSafely(cleanup: () => void) {
  try {
    cleanup();
  } catch (error) {
    console.error("Audio cleanup failed", error);
  }
}

interface RuntimeGraph {
  instruments: RuntimeInstrument[];
  buses: Map<string, RuntimeBus>;
  duckTriggers: DuckTrigger[];
}

class AudioEngine {
  private _ctx: BaseAudioContext;
  private _clock: EngineClock;
  private _master: GainNode;
  private _analyser: AnalyserNode;
  private _activeGraph: RuntimeGraph = {
    instruments: [],
    buses: new Map(),
    duckTriggers: [],
  };
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
  private readonly _sampleBufferCache: SampleBufferCache;
  readonly ready: Promise<void>;

  constructor(ctx: BaseAudioContext, clock: EngineClock) {
    this._ctx = ctx;
    this._clock = clock;
    this._master = ctx.createGain();
    this._analyser = ctx.createAnalyser();
    this._master.connect(ctx.destination);
    this._master.connect(this._analyser);
    this._midiOutputScheduler = new MidiOutputScheduler(clock);
    this._sampleBufferCache = new SampleBufferCache(ctx);

    this.ready = registerWorklets(this._ctx, [
      lfoProcessorSource,
      supersawProcessorSource,
      noiseProcessorSource,
    ]);

    this._unsub = new Set([
      clock.on("prebar", ({ bar }, time) => this._commit(bar, time)),
      clock.on("bar", ({ bar }, time, barDuration) => {
        this._scheduleBar(this._activeGraph, bar, time, barDuration);
      }),
      clock.on("stop", (_metronome, time) => {
        this._activeGraph.instruments.forEach((instrument) =>
          cleanupSafely(() => instrument.cancelFutureNotes()),
        );
        this._activeGraph.buses.forEach((bus) =>
          cleanupSafely(() => bus.stop(time)),
        );
        this._retiringGraphs.forEach((graph) => {
          graph.instruments.forEach((instrument) =>
            cleanupSafely(() => instrument.cancelFutureNotes()),
          );
          graph.buses.forEach((bus) => cleanupSafely(() => bus.stop(time)));
        });
        cleanupSafely(() => this._midiOutputScheduler.stop());
      }),
    ]);
  }

  update(schema: DromeSchema): void {
    const candidate = structuredClone(schema);
    validateDromeGraph(candidate);
    this._pending = candidate;
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
      cleanupSafely(() => instrument.disconnectMidi()),
    );
    this._retiringGraphs.forEach((graph) =>
      graph.instruments.forEach((instrument) =>
        cleanupSafely(() => instrument.disconnectMidi()),
      ),
    );
    cleanupSafely(() => this._midiOutputScheduler.disconnect());
    this._midi = null;
  }

  // Pre-loads all sampler buffers into the cache before the clock starts.
  // Does NOT create instruments — instrument creation (with LFO init) happens in
  // _commit() where startingBar and barStartTime are known.
  async prepare(): Promise<void> {
    if (!this._pending) return;
    const { instruments, banks } = this._pending;

    const urls = new Map<string, boolean>();
    for (const schema of instruments) {
      if (schema.type !== "sampler") continue;
      for (const { url, reverse } of planSamplerPreloads(schema, banks)) {
        urls.set(url, urls.get(url) || reverse);
      }
    }

    await Promise.all(
      Array.from(urls, ([url, reverse]) =>
        this._sampleBufferCache.prepare(url, reverse),
      ),
    );
  }

  private _scheduleBar(
    graph: RuntimeGraph,
    barIndex: number,
    barStartTime: number,
    barDuration: number,
  ) {
    graph.duckTriggers.length = 0;
    graph.instruments.forEach((instrument) =>
      instrument.scheduleBar(barIndex, barStartTime),
    );
    graph.buses.forEach((bus) =>
      bus.scheduleBar(barIndex, barStartTime, barDuration),
    );

    const best = new Map<string, DuckTrigger>();
    for (const trigger of graph.duckTriggers.splice(0)) {
      const key = JSON.stringify([trigger.target, trigger.startTime]);
      const existing = best.get(key);
      if (existing === undefined || trigger.depth > existing.depth) {
        best.set(key, trigger);
      }
    }

    const triggers = [...best.values()];
    triggers
      .sort((left, right) => left.startTime - right.startTime)
      .forEach((trigger) => {
        const bus = graph.buses.get(trigger.target);
        if (!bus) return;
        bus.scheduleDuck({
          depth: trigger.depth,
          onset: trigger.onset,
          recovery: trigger.recovery,
          duration: trigger.duration,
          startTime: trigger.startTime,
        });
      });
  }

  private _commit(upcomingBar = 0, barStartTime?: number): void {
    if (!this._pending) return;

    this._clock.bpm(this._pending.bpm ?? DEFAULT_BPM);

    const pending = this._pending;
    const buses = new Map<string, RuntimeBus>();
    const instruments: RuntimeInstrument[] = [];
    const duckTriggers: DuckTrigger[] = [];
    const onDuck = (trigger: DuckTrigger) => duckTriggers.push(trigger);
    const previousMainGain = this._master.gain.value;
    this._master.gain.value = pending.buses.main?.gain ?? 1;
    try {
      for (const [name, schema] of Object.entries(pending.buses)) {
        if (name === "main") continue;
        buses.set(
          name,
          new RuntimeBus(this._ctx, schema, this._master, {
            startingBar: upcomingBar,
            barStartTime,
          }),
        );
      }

      for (const schema of pending.instruments) {
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
            cache: this._sampleBufferCache,
            startingBar: upcomingBar,
            barStartTime,
            onDuck,
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
            onDuck,
          });
        }
        if (this._midi) instrument.connectMidi(this._midi);
        instruments.push(instrument);
      }
    } catch (error) {
      instruments.forEach((instrument) =>
        cleanupSafely(() => instrument.destroy()),
      );
      buses.forEach((bus) => cleanupSafely(() => bus.destroy()));
      cleanupSafely(() => {
        this._master.gain.value = previousMainGain;
      });
      throw error;
    }

    const oldGraph = this._activeGraph;
    this._activeGraph = { instruments, buses, duckTriggers };
    this._pending = null;
    this._retire(oldGraph);
  }

  private _retire(graph: RuntimeGraph) {
    if (graph.instruments.length === 0 && graph.buses.size === 0) return;
    this._retiringGraphs.add(graph);
    graph.instruments.forEach((instrument) =>
      cleanupSafely(() => instrument.retire()),
    );
    void Promise.all(
      graph.instruments.map((instrument) => instrument.finished),
    ).then(() => {
      if (!this._retiringGraphs.delete(graph)) return;
      graph.instruments.forEach((instrument) =>
        cleanupSafely(() => instrument.destroy()),
      );
      graph.buses.forEach((bus) => cleanupSafely(() => bus.destroy()));
    });
  }

  getAnalyser(): AnalyserNode {
    return this._analyser;
  }

  destroy(): void {
    this._unsub.forEach((fn) => cleanupSafely(fn));
    cleanupSafely(() => this.disconnectMidi());
    cleanupSafely(() => this._midiOutputScheduler.destroy());
    this._activeGraph.instruments.forEach((instrument) =>
      cleanupSafely(() => instrument.destroy()),
    );
    this._activeGraph.buses.forEach((bus) =>
      cleanupSafely(() => bus.destroy()),
    );
    this._retiringGraphs.forEach((graph) => {
      graph.instruments.forEach((instrument) =>
        cleanupSafely(() => instrument.destroy()),
      );
      graph.buses.forEach((bus) => cleanupSafely(() => bus.destroy()));
    });
    this._activeGraph = {
      instruments: [],
      buses: new Map(),
      duckTriggers: [],
    };
    this._retiringGraphs.clear();
    this._pending = null;
    cleanupSafely(() => this._master.disconnect());
    cleanupSafely(() => this._analyser.disconnect());
  }
}

export default AudioEngine;
