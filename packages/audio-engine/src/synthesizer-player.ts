import type AudioClock from "@web-audio/clock";
import type { ParameterSchema, RandomSchema, StaticSchemaValue, SynthesizerSchema } from "@web-audio/schema";
import RandomResolver from "./random-resolver";
import { midiToFrequency } from "./utils/midi-to-frequency";

class SynthesizerPlayer {
  private _ctx: AudioContext;
  private _clock: AudioClock;
  private _schema: SynthesizerSchema;
  private _resolvers = new Map<RandomSchema, RandomResolver>();

  constructor(ctx: AudioContext, clock: AudioClock, schema: SynthesizerSchema) {
    this._ctx = ctx;
    this._clock = clock;
    this._schema = schema;
  }

  scheduleBar(barIndex: number, barStartTime: number) {
    const notes = this._schema.notes;

    if (notes.type === "random") {
      const mask = notes.cycle.cycle[barIndex % notes.cycle.cycle.length];
      mask.forEach((step, stepIndex) => {
        if (step.value === 0) return;
        const midiNote = this._resolve(notes, barIndex, stepIndex);
        const detuneValue = this._resolve(this._schema.detune, barIndex, stepIndex);
        this._scheduleNote({ ...step, value: midiNote }, barStartTime, detuneValue);
      });
      return;
    }

    const notesBar = notes.cycle[barIndex % notes.cycle.length];
    notesBar.forEach((note) => {
      const detuneValue = this._resolve(this._schema.detune, barIndex, note.stepIndex);
      this._scheduleNote(note, barStartTime, detuneValue);
    });
  }

  private _resolve(schema: ParameterSchema, barIndex: number, stepIndex: number): number {
    if (schema.type === "random") {
      return this._getResolver(schema).resolve(barIndex, stepIndex);
    }
    const bar = schema.cycle[barIndex % schema.cycle.length];
    return bar[stepIndex % bar.length].value;
  }

  private _getResolver(schema: RandomSchema): RandomResolver {
    let resolver = this._resolvers.get(schema);
    if (!resolver) {
      resolver = new RandomResolver(schema);
      this._resolvers.set(schema, resolver);
    }
    return resolver;
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
      frequency: midiToFrequency(note.value),
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
