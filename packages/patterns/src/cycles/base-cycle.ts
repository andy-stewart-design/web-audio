import { applyPattern } from "./operations/apply-pattern";
import { reverse } from "./operations/reverse";
import { stretch } from "./operations/stretch";
import { euclid } from "../rhythm/euclid";
import { hex } from "../rhythm/hex";
import { sequence } from "../rhythm/sequence";
import { xox } from "../rhythm/xox";
import type { Cycle } from "./types";
import Speed from "./operations/speed";

abstract class BaseCycle<T> {
  protected _cycle: Cycle<T>;
  protected _nullValue: T;
  private _speed = new Speed();

  constructor(cycle: Cycle<T>, nullValue: T) {
    this._cycle = cycle;
    this._nullValue = nullValue;
  }

  private applyPattern(modifier: number[][]) {
    this.applyPendingSpeed();
    return applyPattern(this._cycle, modifier, this._nullValue);
  }

  protected applyPendingSpeed() {
    if (this._speed.isUnit) return;

    const cycle = this._speed.applyTo(this._cycle, this._nullValue);
    this._speed = new Speed();
    if (cycle) this._cycle = cycle;
  }

  protected replaceCycle(cycle: Cycle<T>) {
    this._cycle = cycle;
    this._speed = new Speed();
  }

  /* ----------------------------------------------------------------
  /* PATTERN MODIFIERS
  ---------------------------------------------------------------- */
  stretch(bars: number, steps = 1) {
    this.applyPendingSpeed();
    this._cycle = stretch(this._cycle, bars, steps);
    return this;
  }

  reverse() {
    this.applyPendingSpeed();
    this._cycle = reverse(this._cycle);
    return this;
  }

  fast(multiplier: number) {
    this._speed.multiply(multiplier);
    return this;
  }

  slow(multiplier: number) {
    this._speed.divide(multiplier);
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
    this.replaceCycle([]);
  }

  /* ----------------------------------------------------------------
  /* GETTERS
  ---------------------------------------------------------------- */
  get length() {
    this.applyPendingSpeed();
    return this._cycle.length;
  }

  get current() {
    this.applyPendingSpeed();
    return this._cycle;
  }
}

export default BaseCycle;
