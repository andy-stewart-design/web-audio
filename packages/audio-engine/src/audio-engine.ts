import type AudioClock from "@web-audio/clock";
import type { SynthesizerSchema } from "@web-audio/fluid";
import SynthesizerPlayer from "./synthesizer-player";

type DromeSchema = { instruments: SynthesizerSchema[] };

class AudioEngine {
  private _players: SynthesizerPlayer[];
  private _unsubscribe: () => void;
  private _lastScheduledBar = -1;

  constructor(ctx: AudioContext, clock: AudioClock, schema: DromeSchema) {
    this._players = schema.instruments.map(
      (inst) => new SynthesizerPlayer(ctx, clock, inst),
    );

    // If the clock is already running, the next bar event may have already
    // been dispatched by the lookahead scheduler. Pre-schedule it now so we
    // don't silently skip a bar. The subscription skips it if it fires again.
    if (!clock.paused) {
      const nextBar = clock.metronome.bar + 1;
      this._lastScheduledBar = nextBar;
      this._players.forEach((p) => p.scheduleBar(nextBar, clock.nextBarStartTime));
    }

    this._unsubscribe = clock.on("bar", ({ bar }, time) => {
      if (bar <= this._lastScheduledBar) return;
      this._lastScheduledBar = bar;
      this._players.forEach((p) => p.scheduleBar(bar, time));
    });
  }

  destroy(): void {
    this._unsubscribe();
  }
}

export default AudioEngine;
export type { DromeSchema };
