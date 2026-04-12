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

abstract class BaseCycle<ValueType, ReturnType = ValueType> {
  protected _cycle: Cycle<ValueType>;
  protected _nullValue: ValueType;

  constructor(cycle: Cycle<ValueType>, nullValue: ValueType) {
    this._cycle = cycle;
    this._nullValue = nullValue;
  }

  protected applyPattern(modifier: number[][]) {
    const nullValue = this._nullValue;

    const cycles = this._cycle;
    const loops = Math.max(cycles.length, modifier.length);
    const nextCycles: Cycle<ValueType> = [];

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
  /* ABSTRACT
  ---------------------------------------------------------------- */
  abstract at(i: number): Cycle<ReturnType>[number];
  abstract at(i: number, j: number): ReturnType;
  abstract at(i: number, j?: number): Cycle<ReturnType>[number] | ReturnType;

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
