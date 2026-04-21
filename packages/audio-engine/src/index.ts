import type AudioClock from "@web-audio/clock";
import type { DromeSchema } from "@web-audio/schema";
import Synthesizer from "./synthesizer";

class AudioEngine {
  private _ctx: AudioContext;
  private _clock: AudioClock;
  private _players: Synthesizer[] = [];
  // Holds retired players until all their scheduled audio (including envelope
  // release tails) has finished. Each player removes itself via whenDone().
  private _retiring: Set<Synthesizer> = new Set();
  private _pending: DromeSchema | null = null;
  private _unsubPrebar: () => void;
  private _unsubBar: () => void;
  private _unsubStop: () => void;

  constructor(ctx: AudioContext, clock: AudioClock) {
    this._ctx = ctx;
    this._clock = clock;

    this._unsubPrebar = clock.on("prebar", () => {
      this._commit();
    });

    this._unsubBar = clock.on("bar", ({ bar }, time) => {
      this._players.forEach((p) => p.scheduleBar(bar, time));
    });

    this._unsubStop = clock.on("stop", () => {
      this._players.forEach((p) => p.cancelFutureNotes());
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
    if (!this._pending) return;

    // Retire current players — each removes itself from _retiring when done
    for (const player of this._players) {
      this._retiring.add(player);
      player.whenDone(() => this._retiring.delete(player));
    }

    // Create new players from the pending schema
    this._players = this._pending.instruments.map(
      (inst) => new Synthesizer(this._ctx, this._clock, inst),
    );

    this._pending = null;
  }

  destroy(): void {
    this._unsubPrebar();
    this._unsubBar();
    this._unsubStop();
    this._players = [];
    this._retiring.clear();
    this._pending = null;
  }
}

export default AudioEngine;
