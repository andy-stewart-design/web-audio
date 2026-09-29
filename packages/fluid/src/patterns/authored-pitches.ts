import {
  MaskedCycle,
  RandomCycle,
  type Chord,
  type ScheduledValue,
} from "@web-audio/patterns";
import type {
  NotePattern,
  RandomNumberPattern,
  TimingPattern,
} from "@web-audio/schema";
import { compileNoteEvents } from "@/instruments/event-compiler";
import EventTiming from "@/patterns/event-timing";
import { getScale } from "@/utils/get-scale";
import { noteStringToMidi } from "@/utils/note-string-to-midi";
import { isRandomCycle, isRandomCycleTuple } from "@/utils/validate";
import type { NoteName, NoteValue, ScaleAlias } from "@/types";

type NoteOrChord<T> = T | T[];
type NoteInput<T> = (NoteOrChord<T> | NoteOrChord<T>[])[];

class AuthoredPitches {
  private _notes: MaskedCycle<Chord> | RandomCycle;
  private _defaultFallback: readonly [number, ...number[]] | undefined;
  private _hasPitchTransform = false;
  private _materializedAgainstTiming = false;
  private _root = 0;
  private _scale: number[] | undefined;

  constructor(defaultPattern: Chord) {
    if (
      !Array.isArray(defaultPattern) ||
      defaultPattern.length === 0 ||
      !defaultPattern.every(
        (value): value is number =>
          typeof value === "number" && Number.isFinite(value),
      )
    ) {
      throw new Error(
        "[Instrument] Default notes require a nonempty fallback group of finite numbers.",
      );
    }
    const [first, ...rest] = defaultPattern;
    this._defaultFallback = [first, ...rest];
    this._notes = new MaskedCycle([[defaultPattern]]);
  }

  private _degreeToMidi(note: number) {
    if (!this._scale) return note + this._root;

    const len = this._scale.length;
    const octave = Math.floor(note / len) * 12;
    const degree = ((note % len) + len) % len;
    const step = this._scale[degree];
    return this._root + octave + step;
  }

  notes(...input: NoteInput<ScheduledValue> | [RandomCycle]) {
    if (input.length === 0) {
      throw new Error("[Instrument] notes() requires at least one pattern.");
    }

    this._defaultFallback = undefined;
    this._materializedAgainstTiming = false;
    if (isRandomCycleTuple(input)) {
      this._notes = input[0];
    } else {
      const cycle = input.map((pattern) =>
        Array.isArray(pattern)
          ? pattern.map((chord) => (Array.isArray(chord) ? chord : [chord]))
          : [[pattern]],
      );
      this._notes = new MaskedCycle(cycle);
    }
    return this;
  }

  root(n: NoteName | NoteValue | number) {
    this._hasPitchTransform = true;
    if (typeof n === "number") this._root = n;
    else this._root = noteStringToMidi(n) || 0;
    return this;
  }

  scale(name: ScaleAlias) {
    this._hasPitchTransform = true;
    this._scale = getScale(name);
    return this;
  }

  reverse() {
    this._notes.reverse();
    return this;
  }

  materializeAgainstTiming(timing: TimingPattern) {
    if (
      isRandomCycle(this._notes) ||
      !this.hasAuthoredValues ||
      this._getStaticScalar()
    ) {
      return this;
    }

    const source = this._notes.activeEvents.map((bar) =>
      bar.filter((chord): chord is number[] => chord !== null),
    );
    const { cycle, mask } = new EventTiming(timing).alignValues(source);
    this._notes = new MaskedCycle(cycle).xox(...mask);
    this._materializedAgainstTiming = true;
    return this;
  }

  fast(multiplier: number) {
    this._notes.fast(multiplier);
    return this;
  }

  slow(multiplier: number) {
    this._notes.slow(multiplier);
    return this;
  }

  stretch(bars: number, steps?: number) {
    this._notes.stretch(bars, steps);
    return this;
  }

  getEventPattern(timingOverride?: TimingPattern, resolveActiveValues = false) {
    if (isRandomCycle(this._notes)) {
      return compileNoteEvents({
        source: {
          type: "random",
          pattern: this._getRandomNotePattern(this._notes),
          candidateTiming: this._notes.candidateTiming,
        },
        explicitTiming: timingOverride,
      });
    }

    return compileNoteEvents({
      source: {
        type: "static",
        cycle: this._notes,
        fallback: this._defaultFallback,
        transform: this._degreeToMidi.bind(this),
        resolveActiveValues,
      },
      explicitTiming: timingOverride,
    });
  }

  getSchema(): NotePattern {
    return this.getEventPattern().notes;
  }

  get hasAuthoredValues() {
    return this._defaultFallback === undefined;
  }

  get defaultFallback() {
    return this._defaultFallback;
  }

  get hasRequestedPitches() {
    return this.hasAuthoredValues || this._hasPitchTransform;
  }

  get materializedAgainstTiming() {
    return this._materializedAgainstTiming;
  }

  useCandidateOrdinalAvailability() {
    this._materializedAgainstTiming = false;
    return this;
  }

  getFixedAvailability() {
    if (isRandomCycle(this._notes) || !this.hasAuthoredValues) {
      return undefined;
    }

    return this._notes.transformedValues.map((bar) =>
      bar.map((chord) =>
        Boolean(chord?.some((value) => typeof value === "number")),
      ),
    );
  }

  getRandomValuesPerBar() {
    return isRandomCycle(this._notes)
      ? this._notes.getRandomSchema().valuesPerBar
      : undefined;
  }

  get hasAuthoredPitchRests() {
    return (
      this.getFixedAvailability()?.some((bar) =>
        bar.some((available) => !available),
      ) ?? false
    );
  }

  private _getStaticScalar() {
    if (isRandomCycle(this._notes)) return undefined;

    const source = this._notes.sourceValues;
    return source.length === 1 && source[0].length === 1
      ? source[0][0]
      : undefined;
  }

  private _getRandomNotePattern(cycle: RandomCycle): RandomNumberPattern {
    const pattern = cycle.getRandomSchema();
    if (pattern.dataType === "binary") {
      return {
        ...pattern,
        valueMap: [this._degreeToMidi(0), this._degreeToMidi(1)],
        range: undefined,
      };
    }
    if (!this._scale) return pattern;

    const degreeMin = Math.floor(pattern.range?.min ?? 0);
    const degreeMax = Math.ceil(pattern.range?.max ?? this._scale.length);
    return {
      ...pattern,
      valueMap: Array.from({ length: degreeMax - degreeMin }, (_, index) =>
        this._degreeToMidi(index + degreeMin),
      ),
      range: undefined,
    };
  }
}

export default AuthoredPitches;
