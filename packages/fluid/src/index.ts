import {
  ChordCycle,
  RandomCycle,
  type Chord,
  type ScheduledValue,
} from "@web-audio/patterns";

type NoteInput<T> = (T | T[] | (T | T[])[])[];

class Instrument {
  protected _cycle: ChordCycle | RandomCycle;

  constructor(defaultPattern: Chord) {
    this._cycle = new ChordCycle(defaultPattern);
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
      return this._cycle.getStaticSchema();
    }
  }
}

class Synth extends Instrument {
  constructor() {
    super([60]);
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
}

export default Instrument;
export { Synth };

// ------------------------------------------------
// UTILITIES
function isRandomCycleTuple<T>(v: unknown[]): v is [T] {
  return v.length === 1 && v[0] instanceof RandomCycle;
}

function isRandomCycle<T>(v: unknown): v is RandomCycle {
  return v instanceof RandomCycle;
}
