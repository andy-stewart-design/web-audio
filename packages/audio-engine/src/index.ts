import type AudioClock from "@web-audio/clock";
import type { DromeSchema } from "@web-audio/schema";
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
  // Players created and fully loaded by prepare() — consumed by _commit()
  private _pendingPlayers: (Synthesizer | Sampler)[] | null = null;
  private _unsub: Set<() => void>;
  // Shared cache across commits — keyed by URL, deduplicates concurrent fetches
  private _bufferCache = new Map<string, Promise<AudioBuffer | null>>();
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

  async prepare(): Promise<void> {
    if (!this._pending) return;
    const { instruments, banks } = this._pending;

    const players: (Synthesizer | Sampler)[] = instruments.map((schema) => {
      if (schema.type === "sampler") {
        return new Sampler(this._ctx, this._clock, {
          schema,
          banks,
          bufferCache: this._bufferCache,
        });
      }
      return new Synthesizer(this._ctx, this._clock, { schema });
    });

    const loads = players
      .filter((p): p is Sampler => p instanceof Sampler)
      .map((p) => p.load());

    await Promise.all(loads);
    this._pendingPlayers = players;
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

    if (this._pendingPlayers) {
      // Use fully-loaded players from prepare() — buffers already decoded
      this._players = this._pendingPlayers;
      this._pendingPlayers = null;
    } else {
      // Mid-playback commit without prepare() — create players and load async
      const banks = this._pending.banks;
      this._players = this._pending.instruments.map((schema) => {
        if (schema.type === "sampler") {
          return new Sampler(this._ctx, this._clock, {
            schema,
            banks,
            bufferCache: this._bufferCache,
            startingBar: upcomingBar,
            barStartTime,
          });
        }
        return new Synthesizer(this._ctx, this._clock, {
          schema,
          startingBar: upcomingBar,
          barStartTime,
        });
      });

      for (const player of this._players) {
        if (player instanceof Sampler && !player.isReady()) {
          player.load();
        }
      }
    }

    this._pending = null;
  }

  destroy(): void {
    this._unsub.forEach((fn) => fn());
    this._players = [];
    this._retiring.clear();
    this._pending = null;
  }
}

export default AudioEngine;
