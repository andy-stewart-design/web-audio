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
import { getScale } from "@/utils/get-scale";
import { noteStringToMidi } from "@/utils/note-string-to-midi";
import { isRandomCycle, isRandomCycleTuple } from "@/utils/validate";
import type { NoteName, NoteValue, ScaleAlias } from "@/types";

type NoteOrChord<T> = T | T[];
type NoteInput<T> = (NoteOrChord<T> | NoteOrChord<T>[])[];

class AuthoredPitches {
  private _notes: MaskedCycle<Chord> | RandomCycle;
  private _hasAuthoredPitchValues = false;
  private _hasRequestedPitches = false;
  private _root = 0;
  private _scale: number[] | undefined;

  constructor(defaultPattern: Chord) {
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

    this._hasAuthoredPitchValues = true;
    this._hasRequestedPitches = true;
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
    this._hasRequestedPitches = true;
    if (typeof n === "number") this._root = n;
    else this._root = noteStringToMidi(n) || 0;
    return this;
  }

  scale(name: ScaleAlias) {
    this._hasRequestedPitches = true;
    this._scale = getScale(name);
    return this;
  }

  reverse() {
    this._notes.reverse();
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

  getEventPattern(timingOverride?: TimingPattern) {
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
        transform: this._degreeToMidi.bind(this),
      },
      explicitTiming: timingOverride,
    });
  }

  getSchema(): NotePattern {
    return this.getEventPattern().notes;
  }

  get hasAuthoredPitchValues() {
    return this._hasAuthoredPitchValues;
  }

  get hasRequestedPitches() {
    return this._hasRequestedPitches;
  }

  get hasAuthoredPitchRests() {
    return (
      !isRandomCycle(this._notes) &&
      this._notes.sourceValues.some((bar) =>
        bar.some(
          (chord) =>
            chord === null ||
            chord === undefined ||
            chord.every((value) => typeof value !== "number"),
        ),
      )
    );
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
