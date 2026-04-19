import type AudioClock from "@web-audio/clock";
import type { DromeSchema } from "@web-audio/schema";
import SynthesizerPlayer from "./synthesizer-player";

class AudioEngine {
  private _ctx: AudioContext;
  private _clock: AudioClock;
  private _players: SynthesizerPlayer[] = [];
  // Holds retired players for one bar so their audio graph stays connected
  // while scheduled oscillators finish playing.
  // @ts-expect-error intentionally write-only
  private _retiring: SynthesizerPlayer[] = [];
  private _pending: DromeSchema | null = null;
  private _unsubPrebar: () => void;
  private _unsubBar: () => void;

  constructor(ctx: AudioContext, clock: AudioClock) {
    this._ctx = ctx;
    this._clock = clock;

    this._unsubPrebar = clock.on("prebar", () => {
      this._commit();
    });

    this._unsubBar = clock.on("bar", ({ bar }, time) => {
      this._players.forEach((p) => p.scheduleBar(bar, time));
    });
  }

  update(schema: DromeSchema): void {
    this._pending = schema;

    // If the clock is paused, commit immediately so players are ready
    // when the first bar event fires.
    if (this._clock.paused) {
      this._commit();
    }
  }

  private _commit(): void {
    // Clean up players that were retired last bar
    this._retiring = [];

    if (!this._pending) return;

    // Retire current players (their scheduled audio keeps playing)
    this._retiring = this._players;

    // Create new players from the pending schema
    this._players = this._pending.instruments.map(
      (inst) => new SynthesizerPlayer(this._ctx, this._clock, inst),
    );

    this._pending = null;
  }

  destroy(): void {
    this._unsubPrebar();
    this._unsubBar();
    this._players = [];
    this._retiring = [];
    this._pending = null;
  }
}

export default AudioEngine;
