import type { Cycle } from "../types";
import { assertCycleLimits } from "../../limits";
import { getSpeedRatio, greatestCommonDivisor } from "../../math/speed-ratio";

class Speed {
  private _numerator = 1;
  private _denominator = 1;

  multiply(multiplier: number) {
    const ratio = getSpeedRatio(multiplier);
    this.combine(ratio.numerator, ratio.denominator);
    return this;
  }

  divide(divisor: number) {
    const ratio = getSpeedRatio(divisor);
    this.combine(ratio.denominator, ratio.numerator);
    return this;
  }

  get isUnit() {
    return this._numerator === this._denominator;
  }

  applyTo<S>(cycle: Cycle<S>, nullValue: S | undefined): Cycle<S> | null {
    if (nullValue === undefined) return null;

    const compressed = compress(cycle, this._numerator);
    const expanded = expand(compressed, nullValue, this._denominator);
    assertCycleLimits(expanded);
    return expanded;
  }

  private combine(numerator: number, denominator: number) {
    const nextNumerator = this._numerator * numerator;
    const nextDenominator = this._denominator * denominator;
    if (
      !Number.isSafeInteger(nextNumerator) ||
      !Number.isSafeInteger(nextDenominator)
    ) {
      throw new Error(
        "[Pattern] Combined speed exceeds safe rational precision.",
      );
    }

    const divisor = greatestCommonDivisor(nextNumerator, nextDenominator);
    this._numerator = nextNumerator / divisor;
    this._denominator = nextDenominator / divisor;
  }
}

function compress<S>(cycle: Cycle<S>, multiplier: number) {
  if (cycle.length === 0) return [];

  const sourceLength = lowestCommonMultiple(cycle.length, multiplier);
  const length = sourceLength / multiplier;

  return Array.from({ length }, (_, barIndex) =>
    Array.from({ length: multiplier }, (_, offset) => {
      const sourceBar = cycle[(barIndex * multiplier + offset) % cycle.length];
      return sourceBar;
    }).flat(),
  );
}

function lowestCommonMultiple(a: number, b: number) {
  const product = a * b;
  if (!Number.isSafeInteger(product)) {
    throw new Error("[Pattern] Combined cycle length exceeds safe precision.");
  }
  return product / greatestCommonDivisor(a, b);
}

function expand<S>(cycle: Cycle<S>, nullValue: S, multiplier: number) {
  return cycle.flatMap((bar) => {
    const expanded = Array.from(
      { length: bar.length * multiplier },
      (_, index) =>
        index % multiplier === 0 ? bar[index / multiplier] : nullValue,
    );

    return Array.from({ length: multiplier }, (_, barIndex) =>
      expanded.slice(barIndex * bar.length, (barIndex + 1) * bar.length),
    );
  });
}

export default Speed;
