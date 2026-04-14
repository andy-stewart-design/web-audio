import {
  ChordCycle,
  RandomCycle,
  type Chord,
  type ScheduledValue,
} from "@web-audio/patterns";
import { getScale } from "@/utils/get-scale";
import { noteToMidi } from "@/utils/note-string-to-midi";
import { midiToFrequency } from "@/utils/midi-to-frequency";
import { isRandomCycle, isRandomCycleTuple } from "@/utils/validate";
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

  private midiToFrequency(note: number) {
    if (!this._scale) return midiToFrequency(note + this._root);

    const octave = Math.floor(note / 7) * 12;
    const degree = ((note % 7) + 7) % 7;
    const step = this._scale[degree];
    return midiToFrequency(this._root + octave + step);
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
    else this._root = noteToMidi(n) || 0;
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

  getSchema() {
    if (isRandomCycle(this._cycle)) {
      return this._cycle.getRandomSchema();
    } else {
      return this._cycle.getStaticSchema(this.midiToFrequency.bind(this));
    }
  }
}

export default Notes;
