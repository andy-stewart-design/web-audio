import type AudioClock from "@web-audio/clock";
import type { SynthesizerSchema } from "@web-audio/fluid";
import type { StaticSchemaValue } from "@web-audio/patterns";

class SynthesizerPlayer {
  private _ctx: AudioContext;
  private _clock: AudioClock;
  private _schema: SynthesizerSchema;

  constructor(ctx: AudioContext, clock: AudioClock, schema: SynthesizerSchema) {
    this._ctx = ctx;
    this._clock = clock;
    this._schema = schema;
  }

  scheduleBar(barIndex: number, barStartTime: number) {
    const notes = this._schema.notes;
    if (notes.type === "random") return;

    const notesBar = notes.cycle[barIndex % notes.cycle.length];
    const detuneBar = this._getDetuneBar(barIndex);

    notesBar.forEach((note) => {
      const detuneValue = detuneBar
        ? detuneBar[note.stepIndex % detuneBar.length].value
        : 0;
      this._scheduleNote(note, barStartTime, detuneValue);
    });
  }

  private _getDetuneBar(barIndex: number) {
    const detune = this._schema.detune;

    if (!detune || detune.type === "random") return null;
    return detune.cycle[barIndex % detune.cycle.length];
  }

  private _scheduleNote(
    note: StaticSchemaValue,
    barStartTime: number,
    detuneValue: number,
  ): void {
    const barDuration = this._clock.barDuration;
    const startTime = barStartTime + note.offset * barDuration;
    const endTime = startTime + note.duration * barDuration;
    const attackTime = 0.005;

    const osc = new OscillatorNode(this._ctx, {
      type: this._schema.waveform,
      frequency: note.value,
      detune: detuneValue,
    });
    const gain = new GainNode(this._ctx);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.25, startTime + attackTime);
    gain.gain.setValueAtTime(0.25, endTime);
    gain.gain.linearRampToValueAtTime(
      0.001,
      endTime + attackTime * note.duration,
    );

    osc.connect(gain);
    gain.connect(this._ctx.destination);
    osc.start(startTime);
    osc.stop(endTime + 0.5 * note.duration);

    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
}

export default SynthesizerPlayer;
