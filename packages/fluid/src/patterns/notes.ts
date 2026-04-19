import {
  ChordCycle,
  RandomCycle,
  type Chord,
  type ScheduledValue,
} from "@web-audio/patterns";
import { getScale } from "@/utils/get-scale";
import { noteStringToMidi } from "@/utils/note-string-to-midi";
import { isRandomCycle, isRandomCycleTuple } from "@/utils/validate";
import type { RandomSchema, StaticSchema } from "@web-audio/schema";
import type { NoteName, NoteValue, ScaleAlias } from "@/types";

type NoteOrChord<T> = T | T[];
type NoteInput<T> = (NoteOrChord<T> | NoteOrChord<T>[])[];

class Notes {
  private _cycle: ChordCycle | RandomCycle;
  private _root = 0;
  private _scale: number[] | undefined;

  constructor(defaultPattern: Chord) {
    this._cycle = new ChordCycle(defaultPattern);
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
    if (isRandomCycleTuple(input)) {
      this._cycle = input[0];
    } else if (!isRandomCycle(this._cycle)) {
      const cycle = input.map((p) =>
        Array.isArray(p) ? p.map((c) => (Array.isArray(c) ? c : [c])) : [[p]],
      );
      this._cycle.pattern(...cycle);
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

  getSchema(): RandomSchema | StaticSchema {
    if (isRandomCycle(this._cycle)) {
      const schema = this._cycle.getRandomSchema();
      if (this._scale) {
        schema.valueMap = this._scale.map((_, i) => this.degreeToMidi(i));
      }
      return schema;
    } else {
      return this._cycle.getStaticSchema(this.degreeToMidi.bind(this));
    }
  }
}

export default Notes;
