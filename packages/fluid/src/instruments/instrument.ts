import {
  RandomCycle,
  type Chord,
  type ScheduledValue,
} from "@web-audio/patterns";
import Envelope from "@/automations/envelope";
import Filter from "@/effects/filter";
import GainEffect from "@/effects/gain";
import AuthoredPitches from "@/patterns/authored-pitches";
import AuthoredTiming from "@/patterns/authored-timing";
import Parameter from "@/patterns/parameter";
import {
  isEnvelopeTuple,
  isLfoTuple,
  isMidiCcTuple,
  isRandomCycleTuple,
} from "@/utils/validate";
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
  SamplerSchema,
  SynthesizerSchema,
  TimingPattern,
} from "@web-audio/schema";
import type Drome from "@/index";

type NoteOrChord<T> = T | T[];
type NoteInput<T> = (NoteOrChord<T> | NoteOrChord<T>[])[];

const DEFAULT_GAIN_ENVELOPE = { a: 0.01, d: 0, s: 1, r: 0.01 } satisfies ADSR;

abstract class Instrument {
  protected _pitches: AuthoredPitches;
  protected _timing: AuthoredTiming;
  protected _detune: AudioParamSource;
  protected _gain: Envelope;
  protected _effects: (Filter | GainEffect)[] = [];
  protected _host: Drome | undefined;
  protected _muted = false;
  protected _route = "main";
  protected _sends = new Map<string, number>();

  constructor(
    defaultPattern: Chord,
    host?: Drome,
    gainEnvelope: Partial<ADSR> = {},
  ) {
    this._pitches = new AuthoredPitches(defaultPattern);
    this._timing = new AuthoredTiming();
    this._detune = new Parameter(0);
    const { a, d, s, r } = { ...DEFAULT_GAIN_ENVELOPE, ...gainEnvelope };
    this._gain = new Envelope().adsr(a, d, s, r);
    this._host = host;
  }

  abstract getSchema(): SynthesizerSchema | SamplerSchema;

  push() {
    this._host?.push(this);
    return this;
  }

  notes(...input: NoteInput<ScheduledValue> | [RandomCycle]) {
    this._pitches.notes(...input);
    this._invalidateMaterializedTiming();
    return this;
  }

  root(n: NoteName | NoteValue | number) {
    this._pitches.root(n);
    return this;
  }

  scale(name: ScaleAlias) {
    this._pitches.scale(name);
    return this;
  }

  euclid(
    pulses: number | number[],
    steps: number,
    rotation: number | number[] = 0,
  ) {
    this._timing.euclid(pulses, steps, rotation);
    this._invalidateMaterializedTiming();
    return this;
  }

  hex(...hexes: (string | number)[]) {
    this._timing.hex(...hexes);
    this._invalidateMaterializedTiming();
    return this;
  }

  reverse() {
    this._materializePitchesForTransform();
    this._pitches.reverse();
    this._timing.reverse();
    return this;
  }

  sequence(steps: number, ...pulses: (number | number[])[]) {
    this._timing.sequence(steps, ...pulses);
    this._invalidateMaterializedTiming();
    return this;
  }

  xox(...input: (number | number[])[] | [RandomCycle]) {
    if (isRandomCycleTuple(input)) {
      const cycle = input[0];
      if (cycle.dataType !== "binary") {
        throw new Error("Instrument.xox() random masks must be binary");
      }
      this._timing.setRandomXox(cycle);
    } else {
      this._timing.xox(...input);
    }
    this._invalidateMaterializedTiming();
    return this;
  }

  fast(multiplier: number) {
    this._materializePitchesForTransform();
    this._pitches.fast(multiplier);
    this._timing.fast(multiplier);
    return this;
  }

  slow(multiplier: number) {
    this._materializePitchesForTransform();
    this._pitches.slow(multiplier);
    this._timing.slow(multiplier);
    return this;
  }

  stretch(bars: number, steps?: number) {
    this._materializePitchesForTransform();
    this._pitches.stretch(bars, steps);
    this._timing.stretch(bars, steps);
    return this;
  }

  protected _materializePitchesForTransform(timing?: TimingPattern) {
    const selectedTiming =
      timing ??
      this._timing.getTimingPattern() ??
      this._pitches.getEventPattern().timing;
    this._pitches.materializeAgainstTiming(selectedTiming);
  }

  protected _invalidateMaterializedTiming() {
    this._pitches.useCandidateOrdinalAvailability();
  }

  protected _getPitchEventPattern(timingOverride?: TimingPattern) {
    return this._pitches.getEventPattern(
      timingOverride ?? this._timing.getTimingPattern(),
    );
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

  mute(enabled = true) {
    this._muted = enabled;
    return this;
  }

  route(target: string) {
    this._route = normalizeTarget(target, "route()");
    return this;
  }

  send(target: string | string[], amount: number) {
    if (!Number.isFinite(amount) || amount < 0 || amount > 1) {
      throw new Error(
        "[Instrument] send() amount must be a finite number in [0, 1].",
      );
    }
    const targets = Array.isArray(target) ? target : [target];
    for (const value of targets) {
      const normalized = normalizeTarget(value, "send()");
      if (normalized === "main") {
        throw new Error("[Instrument] send() cannot target main.");
      }
      this._sends.set(normalized, amount);
    }
    return this;
  }

  gain(...input: CycleInput<number> | [Envelope]) {
    if (isEnvelopeTuple(input)) {
      this._gain = input[0];
    } else {
      this._gain.max(...input);
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

  fx(...effects: (Filter | GainEffect)[]) {
    this._effects.push(...effects);
    return this;
  }
}

function normalizeTarget(target: string, method: string) {
  const normalized = target.trim();
  if (normalized === "") {
    throw new Error(`[Instrument] ${method} target cannot be empty.`);
  }
  return normalized;
}

export default Instrument;
