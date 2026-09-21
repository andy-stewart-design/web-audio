import { FixedTimingCycle, RandomCycle } from "@web-audio/patterns";
import type { ChanceCondition } from "@web-audio/schema";

class AuthoredTiming {
  private _candidates = new FixedTimingCycle();
  private _condition: ChanceCondition | undefined;
  private _explicit = false;

  get isExplicit() {
    return this._explicit;
  }

  euclid(
    pulses: number | number[],
    steps: number,
    rotation: number | number[] = 0,
  ) {
    this._candidates.euclid(pulses, steps, rotation);
    this._explicit = true;
    return this;
  }

  hex(...hexes: (string | number)[]) {
    this._candidates.hex(...hexes);
    this._explicit = true;
    return this;
  }

  sequence(steps: number, ...pulses: (number | number[])[]) {
    this._candidates.sequence(steps, ...pulses);
    this._explicit = true;
    return this;
  }

  xox(...input: (number | number[])[] | string[]) {
    this._candidates.xox(...input);
    this._explicit = true;
    return this;
  }

  setRandomXox(cycle: RandomCycle) {
    this._candidates = cycle.getFixedTimingCycle();
    this._condition = cycle.getTimingCondition();
    this._explicit = true;
    return this;
  }

  reverse() {
    this._candidates.reverse();
    if (this._condition) {
      this._condition = {
        ...this._condition,
        order: this._condition.order === "forward" ? "reverse" : "forward",
      };
    }
    return this;
  }

  fast(multiplier: number) {
    this._candidates.fast(multiplier);
    return this;
  }

  slow(multiplier: number) {
    this._candidates.slow(multiplier);
    return this;
  }

  stretch(bars: number, steps?: number) {
    this._candidates.stretch(bars, steps);
    return this;
  }

  getTimingPattern() {
    if (!this._explicit) return undefined;

    const timing = this._candidates.getTimingPattern();
    if (!this._condition || this._condition.probability === 1) return timing;
    if (this._condition.probability === 0) {
      return { cycle: timing.cycle.map(() => []) };
    }

    return { ...timing, condition: cloneCondition(this._condition) };
  }
}

function cloneCondition(condition: ChanceCondition) {
  return {
    ...condition,
    segments: condition.segments.map((segment) => ({ ...segment })),
  };
}

export default AuthoredTiming;
