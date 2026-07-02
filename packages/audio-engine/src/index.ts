import type AudioClock from "@web-audio/clock";
import type { BankSchema, DromeSchema, SamplerSchema } from "@web-audio/schema";
import { lfoProcessorSource } from "@web-audio/worklets";
import Sampler from "./instruments/sampler";
import Synthesizer from "./instruments/synthesizer";
import { registerWorklets } from "./utils/register-worklets";
import { preloadVariationIndices } from "./utils/preload-variations";
import { resolveSampleUrl } from "./utils/resolve-sample-entry";

class AudioEngine {
  private _ctx: AudioContext;
  private _clock: AudioClock;
  private _master: GainNode;
  private _analyser: AnalyserNode;
  private _instruments: (Synthesizer | Sampler)[] = [];
  // Holds retired instruments until all their scheduled audio (including envelope
  // release tails) has finished. Each instrument removes itself via whenDone().
  private _retiring: Set<Synthesizer | Sampler> = new Set();
  // Last-write-wins: if update() is called multiple times before the next
  // prebar fires, only the most recent schema is committed. Earlier schemas
  // are intentionally discarded — in a live coding context, only the latest
  // user intent should take effect.
  private _pending: DromeSchema | null = null;
  private _unsub: Set<() => void>;
  // Two-level cache: resolved for synchronous access in _commit(), promises
  // for deduplicating concurrent fetches across instruments and commits.
  private _cache = {
    resolved: new Map<string, AudioBuffer>(),
    promises: new Map<string, Promise<AudioBuffer | null>>(),
  };
  readonly ready: Promise<void>;

  constructor(ctx: AudioContext, clock: AudioClock) {
    this._ctx = ctx;
    this._clock = clock;
    this._master = ctx.createGain();
    this._analyser = ctx.createAnalyser();
    this._master.connect(ctx.destination);
    this._master.connect(this._analyser);

    this.ready = registerWorklets(this._ctx, [lfoProcessorSource]);

    this._unsub = new Set([
      clock.on("prebar", ({ bar }, time) => this._commit(bar, time)),
      clock.on("bar", ({ bar }, time) => {
        this._instruments.forEach((inst) => inst.scheduleBar(bar, time));
      }),
      clock.on("stop", () => {
        this._instruments.forEach((inst) => inst.cancelFutureNotes());
      }),
    ]);
  }

  update(schema: DromeSchema): void {
    this._pending = schema;
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
        for (const variationIndex of preloadVariationIndices(schema)) {
          const url = this._resolveUrl(schema, banks, sourceKey, variationIndex);
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

    // Retire current instruments — each removes itself from _retiring when done
    for (const inst of this._instruments) {
      this._retiring.add(inst);
      inst.done.then(() => this._retiring.delete(inst));
    }

    // Create instruments with correct startingBar/barStartTime for LFO phase init
    const banks = this._pending.banks;
    this._instruments = this._pending.instruments.map((schema, index) => {
      if (schema.type === "sampler") {
        const inst = new Sampler(this._ctx, this._clock, {
          schema,
          destination: this._master,
          banks,
          cache: this._cache,
          startingBar: upcomingBar,
          barStartTime,
          fallbackBuffer: this._fallbackBufferFor(schema, index),
        });
        // load() hits _cache.resolved synchronously if prepare() ran — no yield.
        // If the requested sample is still loading, the sampler keeps using the
        // previous matching buffer until the new one is decoded.
        inst.load();
        return inst;
      }
      return new Synthesizer(this._ctx, this._clock, {
        schema,
        destination: this._master,
        startingBar: upcomingBar,
        barStartTime,
      });
    });

    this._pending = null;
  }

  private _fallbackBufferFor(
    schema: SamplerSchema,
    index: number,
  ): AudioBuffer | null {
    const previous = this._instruments[index];
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
    this._instruments = [];
    this._retiring.clear();
    this._pending = null;
    this._master.disconnect();
    this._analyser.disconnect();
  }
}

export default AudioEngine;
