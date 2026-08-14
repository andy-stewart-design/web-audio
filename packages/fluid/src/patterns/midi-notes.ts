import {
  BinaryCycle,
  getChordStaticSchema,
  MaskedCycle,
  RandomCycle,
  type Chord,
  type ScheduledValue,
} from "@web-audio/patterns";
import { getScale } from "@/utils/get-scale";
import { noteStringToMidi } from "@/utils/note-string-to-midi";
import { isRandomCycle, isRandomCycleTuple } from "@/utils/validate";
import type {
  ParameterSchema,
  RandomSchema,
  StaticSchema,
} from "@web-audio/schema";
import type { NoteName, NoteValue, ScaleAlias } from "@/types";

type NoteOrChord<T> = T | T[];
type NoteInput<T> = (NoteOrChord<T> | NoteOrChord<T>[])[];

class MidiNotes {
  private _notes: MaskedCycle<Chord> | RandomCycle;
  private _randomMask: RandomCycle | undefined;
  private _root = 0;
  private _scale: number[] | undefined;

  constructor(defaultPattern: Chord) {
    this._notes = new MaskedCycle([[defaultPattern]]);
  }

  private degreeToMidi(note: number) {
    if (!this._scale) return note + this._root;

    const len = this._scale.length;
    const octave = Math.floor(note / len) * 12;
    const degree = ((note % len) + len) % len;
    const step = this._scale[degree];
    return this._root + octave + step;
  }

  notes(...input: NoteInput<ScheduledValue> | [RandomCycle]) {
    this._randomMask = undefined;
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
    return this;
  }

  hex(...hexes: (string | number)[]) {
    this._notes.hex(...hexes);
    return this;
  }

  reverse() {
    this._notes.reverse();
    return this;
  }

  sequence(steps: number, ...pulses: (number | number[])[]) {
    this._notes.sequence(steps, ...pulses);
    return this;
  }

  xox(...input: (number | number[])[] | [RandomCycle]) {
    if (isRandomCycleTuple(input)) {
      this._randomMask = input[0];
    } else {
      this._randomMask = undefined;
      this._notes.xox(...input);
    }
    return this;
  }

  getMask(): ParameterSchema | undefined {
    if (this._randomMask) {
      const schema = this._randomMask.getRandomSchema();
      if (schema.dataType !== "binary") {
        throw new Error("Instrument.xox() random masks must be binary");
      }
      return schema;
    }

    if (isRandomCycle(this._notes) || !this._notes.mask) return undefined;
    const mask = new BinaryCycle();
    mask.replace(this._notes.mask);
    return mask.getStaticSchema();
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

  getSchema(): RandomSchema | StaticSchema {
    if (isRandomCycle(this._notes)) {
      const schema = this._notes.getRandomSchema();
      if (schema.dataType === "binary") {
        schema.valueMap = [this.degreeToMidi(0), this.degreeToMidi(1)];
        schema.range = undefined;
      } else if (this._scale) {
        // Use range to determine how many scale degrees to resolve.
        // range.max is exclusive, so {min:0, max:14} → degrees 0–13 (two octaves).
        // Defaults to one octave when no range is set.
        const degreeMin = Math.floor(schema.range?.min ?? 0);
        const degreeMax = Math.ceil(schema.range?.max ?? this._scale.length);
        schema.valueMap = Array.from(
          { length: degreeMax - degreeMin },
          (_, i) => this.degreeToMidi(i + degreeMin),
        );
        // range is consumed — the engine's valueMap path ignores it
        schema.range = undefined;
      }
      return schema;
    }

    return getChordStaticSchema(
      this._notes.activeEvents,
      this.degreeToMidi.bind(this),
    );
  }
}

export default MidiNotes;
