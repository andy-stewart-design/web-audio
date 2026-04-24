import {
  applyPattern,
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

  private applyPattern(modifier: number[][]) {
    return applyPattern(this._cycle, modifier, this._nullValue);
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
