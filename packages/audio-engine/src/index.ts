import type AudioClock from "@web-audio/clock";
import type { BankSchema, DromeSchema, SamplerSchema } from "@web-audio/schema";
import { lfoProcessorSource } from "@web-audio/worklets";
import Sampler from "./sampler";
import Synthesizer from "./synthesizer";
import { registerWorklets } from "./utils/register-worklets";

class AudioEngine {
  private _ctx: AudioContext;
  private _clock: AudioClock;
  private _players: (Synthesizer | Sampler)[] = [];
  // Holds retired players until all their scheduled audio (including envelope
  // release tails) has finished. Each player removes itself via whenDone().
  private _retiring: Set<Synthesizer | Sampler> = new Set();
  // Last-write-wins: if update() is called multiple times before the next
  // prebar fires, only the most recent schema is committed. Earlier schemas
  // are intentionally discarded — in a live coding context, only the latest
  // user intent should take effect.
  private _pending: DromeSchema | null = null;
  private _unsub: Set<() => void>;
  // Two-level cache: resolved for synchronous access in _commit(), promises
  // for deduplicating concurrent fetches across players and commits.
  private _cache = {
    resolved: new Map<string, AudioBuffer>(),
    promises: new Map<string, Promise<AudioBuffer | null>>(),
  };
  readonly ready: Promise<void>;

  constructor(ctx: AudioContext, clock: AudioClock) {
    this._ctx = ctx;
    this._clock = clock;

    this.ready = registerWorklets(this._ctx, [lfoProcessorSource]);

    this._unsub = new Set([
      clock.on("prebar", ({ bar }, time) => this._commit(bar, time)),
      clock.on("bar", ({ bar }, time) => {
        this._players.forEach((p) => p.scheduleBar(bar, time));
      }),
      clock.on("stop", () => {
        this._players.forEach((p) => p.cancelFutureNotes());
      }),
    ]);
  }

  update(schema: DromeSchema): void {
    this._pending = schema;
  }

  // Pre-loads all sampler buffers into the cache before the clock starts.
  // Does NOT create players — player creation (with LFO init) happens in
  // _commit() where startingBar and barStartTime are known.
  async prepare(): Promise<void> {
    if (!this._pending) return;
    const { instruments, banks } = this._pending;

    const urls = new Set<string>();
    for (const schema of instruments) {
      if (schema.type !== "sampler") continue;
      const url = this._resolveUrl(schema, banks);
      if (url) urls.add(url);
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

    // Retire current players — each removes itself from _retiring when done
    for (const player of this._players) {
      this._retiring.add(player);
      player.done.then(() => this._retiring.delete(player));
    }

    // Create players with correct startingBar/barStartTime for LFO phase init
    const banks = this._pending.banks;
    this._players = this._pending.instruments.map((schema) => {
      if (schema.type === "sampler") {
        const player = new Sampler(this._ctx, this._clock, {
          schema,
          banks,
          cache: this._cache,
          startingBar: upcomingBar,
          barStartTime,
        });
        // load() hits _cache.resolved synchronously if prepare() ran — no yield
        player.load();
        return player;
      }
      return new Synthesizer(this._ctx, this._clock, {
        schema,
        startingBar: upcomingBar,
        barStartTime,
      });
    });

    this._pending = null;
  }

  // Resolves the primary URL for a sampler schema (variation 0).
  // Duplicated from Sampler._resolveUrl to avoid creating player instances.
  private _resolveUrl(
    schema: SamplerSchema,
    banks: Record<string, BankSchema>,
  ): string | null {
    const bank = banks[schema.bank];
    if (!bank) return null;
    const variations = bank.samples[schema.sample];
    if (!variations?.length) return null;
    return variations[0];
  }

  destroy(): void {
    this._unsub.forEach((fn) => fn());
    this._players = [];
    this._retiring.clear();
    this._pending = null;
  }
}

export default AudioEngine;
