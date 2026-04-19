import {
  RandomCycle,
  type Chord,
  type ScheduledValue,
} from "@web-audio/patterns";
import Notes from "@/patterns/notes";
import Parameter from "@/patterns/parameter";
import type { NoteName, NoteValue, ScaleAlias } from "@/types";

type NoteOrChord<T> = T | T[];
type NoteInput<T> = (NoteOrChord<T> | NoteOrChord<T>[])[];

class Instrument {
  protected _cycle: Notes;
  protected _detune: Parameter;

  constructor(defaultPattern: Chord) {
    this._cycle = new Notes(defaultPattern);
    this._detune = new Parameter(0);
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

  detune(...input: (number | number[])[] | [RandomCycle]) {
    this._detune = new Parameter(...input);
    return this;
  }
}

export default Instrument;
