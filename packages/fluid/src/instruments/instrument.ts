import {
  RandomCycle,
  type Chord,
  type ScheduledValue,
} from "@web-audio/patterns";
import Envelope from "@/automations/envelope";
import Filter from "@/effects/filter";
import GainEffect from "@/effects/gain";
import MidiNotes from "@/patterns/midi-notes";
import Parameter from "@/patterns/parameter";
import {
  normalizeBusName,
  normalizeBusTargets,
  normalizeDuckDepth,
  normalizeDuckTiming,
  normalizeSendAmount,
} from "@/utils/signal-graph";
import { isEnvelopeTuple, isLfoTuple, isMidiCcTuple } from "@/utils/validate";
import type {
  ADSR,
  AudioParamInput,
  AudioParamSource,
  CycleInput,
  NoteName,
  NoteValue,
  ScaleAlias,
} from "@/types";
import type {
  DuckSchema,
  SamplerSchema,
  SynthesizerSchema,
} from "@web-audio/schema";
import type Drome from "@/index";

type NoteOrChord<T> = T | T[];
type NoteInput<T> = (NoteOrChord<T> | NoteOrChord<T>[])[];

const DEFAULT_GAIN_ENVELOPE = { a: 0.01, d: 0, s: 1, r: 0.01 } satisfies ADSR;

abstract class Instrument {
  protected _cycle: MidiNotes;
  protected _detune: AudioParamSource;
  protected _gain: Envelope;
  protected _effects: (Filter | GainEffect)[] = [];
  protected _host: Drome | undefined;
  protected _muted = false;
  private _gainEnvelope: ADSR;
  private _route = "main";
  private _sends: Record<string, number> = {};
  private _ducks: Record<string, DuckSchema> = {};

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

  xox(...input: (number | number[])[] | [RandomCycle]) {
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

  detune(...input: AudioParamInput) {
    if (isLfoTuple(input)) {
      this._detune = input[0];
    } else if (isEnvelopeTuple(input)) {
      this._detune = input[0];
    } else if (isMidiCcTuple(input)) {
      this._detune = input[0];
    } else {
      this._detune = new Parameter(...input);
    }
    return this;
  }

  route(target: string) {
    this._route = normalizeBusName(target);
    return this;
  }

  send(target: string | string[], amount: number) {
    const normalizedAmount = normalizeSendAmount(amount);
    for (const name of normalizeBusTargets(target)) {
      this._sends[name] = normalizedAmount;
    }
    return this;
  }

  duck(target: string | string[], depth = 1, onset = 0, recovery = 1) {
    const config = {
      depth: normalizeDuckDepth(depth),
      onset: normalizeDuckTiming(onset, "onset"),
      recovery: normalizeDuckTiming(recovery, "recovery"),
    };
    for (const name of normalizeBusTargets(target)) {
      this._ducks[name] = config;
    }
    return this;
  }

  mute(enabled = true) {
    this._muted = enabled;
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

  protected _getSignalGraphSchema() {
    return {
      route: this._route,
      sends: { ...this._sends },
      ducks: Object.fromEntries(
        Object.entries(this._ducks).map(([target, config]) => [
          target,
          { ...config },
        ]),
      ),
    };
  }

  fx(...effects: (Filter | GainEffect)[]) {
    this._effects.push(...effects);
    return this;
  }
}

export default Instrument;
