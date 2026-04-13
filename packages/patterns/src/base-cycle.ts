import {
  euclid,
  fast,
  hex,
  stretch,
  reverse,
  sequence,
  slow,
  xox,
  type Cycle,
} from "./utils";

abstract class BaseCycle<T> {
  protected _cycle: Cycle<T>;
  protected _nullValue: T;

  constructor(cycle: Cycle<T>, nullValue: T) {
    this._cycle = cycle;
    this._nullValue = nullValue;
  }

  protected applyPattern(modifier: number[][]) {
    const nullValue = this._nullValue;

    const cycles = this._cycle;
    const loops = Math.max(cycles.length, modifier.length);
    const nextCycles: Cycle<T> = [];

    for (let i = 0; i < loops; i++) {
      let noteIndex = 0;
      const cycle = cycles[i % cycles.length] ?? [];

      const nextCycle = modifier[i % modifier.length].map((p) =>
        p === 0 ? nullValue : cycle[noteIndex++ % cycle.length],
      );

      nextCycles.push(nextCycle);
    }

    return nextCycles;
  }

  /* ----------------------------------------------------------------
  /* PATTERN MODIFIERS
  ---------------------------------------------------------------- */
  stretch(bars: number, steps = 1) {
    this._cycle = stretch(this._cycle, bars, steps);
    return this;
  }

  reverse() {
    this._cycle = reverse(this._cycle);
    return this;
  }

  fast(mult: number) {
    const nextCycle = fast(this._cycle, this._nullValue, mult);
    if (!nextCycle) return this;
    this._cycle = nextCycle;
    return this;
  }

  slow(mult: number) {
    const nextCycle = slow(this._cycle, this._nullValue, mult);
    if (!nextCycle) return this;
    this._cycle = nextCycle;
    return this;
  }

  euclid(pulses: number | number[], steps: number, rot?: number | number[]) {
    this._cycle = this.applyPattern(euclid(pulses, steps, rot));
    return this;
  }

  hex(...input: (string | number)[]) {
    this._cycle = this.applyPattern(input.map(hex));
    return this;
  }

  sequence(stepCount: number, ...steps: (number | number[])[]) {
    this._cycle = this.applyPattern(sequence(stepCount, ...steps));
    return this;
  }

  xox(...steps: (number | number[])[] | string[]) {
    this._cycle = this.applyPattern(xox(...steps));
    return this;
  }

  clear() {
    this._cycle = [];
  }

  /* ----------------------------------------------------------------
  /* GETTERS
  ---------------------------------------------------------------- */
  get length() {
    return this._cycle.length;
  }

  get current() {
    return this._cycle;
  }
}

export default BaseCycle;
