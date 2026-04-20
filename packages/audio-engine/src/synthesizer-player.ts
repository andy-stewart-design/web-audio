import type AudioClock from "@web-audio/clock";
import type { EnvelopeSchema, ParameterSchema, RandomSchema, StaticSchemaValue, SynthesizerSchema } from "@web-audio/schema";
import RandomResolver from "./random-resolver";
import { midiToFrequency } from "./utils/midi-to-frequency";
import { normalizeADSR } from "./utils/normalize";

const BASE_GAIN = 0.25;
const MIN_RAMP = 0.005;

interface ScheduledNote {
  osc: OscillatorNode;
  gain: GainNode;
  startTime: number;
}

class SynthesizerPlayer {
  private _ctx: AudioContext;
  private _clock: AudioClock;
  private _schema: SynthesizerSchema;
  private _resolvers = new Map<RandomSchema, RandomResolver>();
  private _scheduled: Set<ScheduledNote> = new Set();

  constructor(ctx: AudioContext, clock: AudioClock, schema: SynthesizerSchema) {
    this._ctx = ctx;
    this._clock = clock;
    this._schema = schema;
  }

  scheduleBar(barIndex: number, barStartTime: number) {
    const notes = this._schema.notes;

    const detune = this._schema.detune;

    if (notes.type === "random") {
      const mask = notes.cycle.cycle[barIndex % notes.cycle.cycle.length];
      mask.forEach((step, stepIndex) => {
        if (step.value === 0) return;
        const midiNote = this._resolve(notes, barIndex, stepIndex);
        const detuneValue = detune.type !== "envelope" ? this._resolve(detune, barIndex, stepIndex) : 0;
        this._scheduleNote({ ...step, value: midiNote }, barStartTime, detuneValue, barIndex);
      });
      return;
    }

    const notesBar = notes.cycle[barIndex % notes.cycle.length];
    notesBar.forEach((note) => {
      const detuneValue = detune.type !== "envelope" ? this._resolve(detune, barIndex, note.stepIndex) : 0;
      this._scheduleNote(note, barStartTime, detuneValue, barIndex);
    });
  }

  cancelFutureNotes(): void {
    const now = this._ctx.currentTime;
    for (const note of this._scheduled) {
      if (note.startTime > now) {
        note.osc.stop(0);
        note.osc.disconnect();
        note.gain.disconnect();
        this._scheduled.delete(note);
      }
    }
  }

  private _resolve(schema: ParameterSchema, barIndex: number, stepIndex: number): number {
    if (schema.type === "random") {
      return this._getResolver(schema).resolve(barIndex, stepIndex);
    }
    const bar = schema.cycle[barIndex % schema.cycle.length];
    return bar[stepIndex % bar.length].value;
  }

  private _resolveEnvelope(envelope: EnvelopeSchema, barIndex: number, stepIndex: number) {
    return {
      min: envelope.min,
      max: this._resolve(envelope.max, barIndex, stepIndex),
      a: this._resolve(envelope.a, barIndex, stepIndex),
      d: this._resolve(envelope.d, barIndex, stepIndex),
      s: this._resolve(envelope.s, barIndex, stepIndex),
      r: this._resolve(envelope.r, barIndex, stepIndex),
      mode: envelope.mode,
    };
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
    barIndex: number,
  ): void {
    const barDuration = this._clock.barDuration;
    const startTime = barStartTime + note.offset * barDuration;
    const noteDuration = note.duration * barDuration;
    const endTime = startTime + noteDuration;

    // Resolve and normalize gain envelope
    const env = this._resolveEnvelope(this._schema.gain, barIndex, note.stepIndex);
    const { a, d, s, r } = normalizeADSR(env.a, env.d, env.s, env.r, env.mode);

    const gainMin = env.min * BASE_GAIN;
    const gainMax = env.max * BASE_GAIN;
    const gainSustain = gainMin + (gainMax - gainMin) * s;

    const attackDur = Math.max(a * noteDuration, MIN_RAMP);
    const decayDur = Math.max(d * noteDuration, MIN_RAMP);
    const releaseDur = Math.max(r * noteDuration, MIN_RAMP);

    const osc = new OscillatorNode(this._ctx, {
      type: this._schema.waveform,
      frequency: midiToFrequency(note.value),
      detune: detuneValue,
    });
    const gain = new GainNode(this._ctx);

    gain.gain.setValueAtTime(gainMin, startTime);
    gain.gain.linearRampToValueAtTime(gainMax, startTime + attackDur);
    gain.gain.linearRampToValueAtTime(gainSustain, startTime + attackDur + decayDur);
    gain.gain.setValueAtTime(gainSustain, endTime);
    gain.gain.linearRampToValueAtTime(gainMin, endTime + releaseDur);

    osc.connect(gain);
    gain.connect(this._ctx.destination);
    osc.start(startTime);
    osc.stop(endTime + releaseDur + 0.05);

    const scheduled: ScheduledNote = { osc, gain, startTime };
    this._scheduled.add(scheduled);

    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
      this._scheduled.delete(scheduled);
    };
  }
}

export default SynthesizerPlayer;
