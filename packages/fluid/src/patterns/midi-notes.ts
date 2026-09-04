import {
  MaskedCycle,
  RandomCycle,
  type Chord,
  type ScheduledValue,
} from "@web-audio/patterns";
import type { NotePattern, RandomNumberPattern } from "@web-audio/schema";
import { compileEventPatterns } from "@/instruments/event-pattern-compiler";
import { getScale } from "@/utils/get-scale";
import { noteStringToMidi } from "@/utils/note-string-to-midi";
import { isRandomCycle, isRandomCycleTuple } from "@/utils/validate";
import type { NoteName, NoteValue, ScaleAlias } from "@/types";

type NoteOrChord<T> = T | T[];
type NoteInput<T> = (NoteOrChord<T> | NoteOrChord<T>[])[];

type RhythmState = { type: "fixed" } | { type: "random"; cycle: RandomCycle };

class MidiNotes {
  private _notes: MaskedCycle<Chord> | RandomCycle;
  // Retains whether timing is inferred from notes or supplied by an explicit
  // fixed/random rhythm, so timing priority can be resolved during compilation.
  private _rhythmState: RhythmState | undefined;
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

    this._rhythmState = undefined;
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
    if (typeof n === "number") this._root = n;
    else this._root = noteStringToMidi(n) || 0;
    return this;
  }

  scale(name: ScaleAlias) {
    this._scale = getScale(name);
    return this;
  }

  euclid(
    pulses: number | number[],
    steps: number,
    rotation: number | number[] = 0,
  ) {
    this._notes.euclid(pulses, steps, rotation);
    this._rhythmState = { type: "fixed" };
    return this;
  }

  hex(...hexes: (string | number)[]) {
    this._notes.hex(...hexes);
    this._rhythmState = { type: "fixed" };
    return this;
  }

  reverse() {
    this._notes.reverse();
    return this;
  }

  sequence(steps: number, ...pulses: (number | number[])[]) {
    this._notes.sequence(steps, ...pulses);
    this._rhythmState = { type: "fixed" };
    return this;
  }

  xox(...input: (number | number[])[] | [RandomCycle]) {
    if (isRandomCycleTuple(input)) {
      this._rhythmState = { type: "random", cycle: input[0] };
    } else {
      this._notes.xox(...input);
      this._rhythmState = { type: "fixed" };
    }
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

  getEvents() {
    const explicitTiming = this._getExplicitTiming();

    if (isRandomCycle(this._notes)) {
      return compileEventPatterns({
        source: {
          type: "random",
          pattern: this._getRandomNotePattern(this._notes),
          candidateTiming: this._notes.candidateTiming,
        },
        explicitTiming,
      });
    }

    return compileEventPatterns({
      source: {
        type: "static",
        cycle: this._notes,
        transform: this._degreeToMidi.bind(this),
      },
      explicitTiming,
    });
  }

  getSchema(): NotePattern {
    return this.getEvents().notes;
  }

  private _getExplicitTiming() {
    if (this._rhythmState?.type !== "random") return undefined;
    if (this._rhythmState.cycle.dataType !== "binary") {
      throw new Error("Instrument.xox() random masks must be binary");
    }
    return this._rhythmState.cycle.getTimingSchema();
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

export default MidiNotes;
