import {
  RandomCycle,
  type Chord,
  type ScheduledValue,
} from "@web-audio/patterns";
import Envelope from "@/automations/envelope";
import Lfo from "@/automations/lfo";
import Filter from "@/effects/filter";
import GainEffect from "@/effects/gain";
import MidiNotes from "@/patterns/midi-notes";
import Parameter from "@/patterns/parameter";
import { isEnvelopeTuple, isLfoTuple } from "@/utils/validate";
import type {
  ADSR,
  CycleInput,
  NoteName,
  NoteValue,
  ScaleAlias,
} from "@/types";
import type { SamplerSchema, SynthesizerSchema } from "@web-audio/schema";
import type Drome from "@/index";

type NoteOrChord<T> = T | T[];
type NoteInput<T> = (NoteOrChord<T> | NoteOrChord<T>[])[];

const DEFAULT_GAIN_ENVELOPE = { a: 0.01, d: 0, s: 1, r: 0.01 } satisfies ADSR;

abstract class Instrument {
  protected _cycle: MidiNotes;
  protected _detune: Parameter | Envelope | Lfo;
  protected _gain: Envelope;
  protected _effects: (Filter | GainEffect)[] = [];
  protected _host: Drome | undefined;
  private _gainEnvelope: ADSR;

  constructor(
    defaultPattern: Chord,
    host?: Drome,
    gainEnvelope: Partial<ADSR> = {},
  ) {
    this._cycle = new MidiNotes(defaultPattern);
    this._detune = new Parameter(0);
    this._gainEnvelope = { ...DEFAULT_GAIN_ENVELOPE, ...gainEnvelope };
    this._gain = this._createGainEnvelope();
    this._host = host;
  }

  abstract getSchema(): SynthesizerSchema | SamplerSchema;

  push() {
    this._host?.push(this);
    return this;
  }

  notes(...input: NoteInput<ScheduledValue> | [RandomCycle]) {
    this._cycle.notes(...input);
    return this;
  }

  root(n: NoteName | NoteValue | number) {
    this._cycle.root(n);
    return this;
  }

  scale(name: ScaleAlias) {
    this._cycle.scale(name);
    return this;
  }

  euclid(
    pulses: number | number[],
    steps: number,
    rotation: number | number[] = 0,
  ) {
    this._cycle.euclid(pulses, steps, rotation);
    return this;
  }

  hex(...hexes: (string | number)[]) {
    this._cycle.hex(...hexes);
    return this;
  }

  reverse() {
    this._cycle.reverse();
    return this;
  }

  sequence(steps: number, ...pulses: (number | number[])[]) {
    this._cycle.sequence(steps, ...pulses);
    return this;
  }

  xox(...input: (number | number[])[]) {
    this._cycle.xox(...input);
    return this;
  }

  fast(multiplier: number) {
    this._cycle.fast(multiplier);
    return this;
  }

  slow(multiplier: number) {
    this._cycle.slow(multiplier);
    return this;
  }

  stretch(bars: number, steps?: number) {
    this._cycle.stretch(bars, steps);
    return this;
  }

  detune(...input: CycleInput | [Envelope] | [Lfo]) {
    if (isLfoTuple(input)) {
      this._detune = input[0];
    } else if (isEnvelopeTuple(input)) {
      this._detune = input[0];
    } else {
      this._detune = new Parameter(...input);
    }
    return this;
  }

  gain(...input: CycleInput | [Envelope]) {
    if (isEnvelopeTuple(input)) {
      this._gain = input[0];
    } else {
      this._gain = this._createGainEnvelope(...input);
    }
    return this;
  }

  adsr(
    a: number | number[],
    d: number | number[],
    s: number | number[],
    r: number | number[],
  ) {
    this._gain.adsr(a, d, s, r);
    return this;
  }

  private _createGainEnvelope(...max: CycleInput) {
    const { a, d, s, r } = this._gainEnvelope;
    return new Envelope(0, ...max).adsr(a, d, s, r);
  }

  fx(...effects: (Filter | GainEffect)[]) {
    this._effects.push(...effects);
    return this;
  }
}

export default Instrument;
