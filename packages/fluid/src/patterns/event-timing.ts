import { assertCycleBarLimit } from "@web-audio/patterns";
import type { TimingPattern } from "@web-audio/schema";

type AlignedEventValues<T> = {
  cycle: T[][];
  mask: number[][];
};

class EventTiming {
  private _timing: TimingPattern;

  constructor(timing: TimingPattern) {
    this._timing = timing;
  }

  alignValues<T>(source: T[][]): AlignedEventValues<T> {
    const cycleLength = lowestCommonMultiple(
      this._timing.cycle.length,
      source.length,
    );
    assertCycleBarLimit(cycleLength);

    return {
      cycle: Array.from({ length: cycleLength }, (_, barIndex) => {
        const timingBar =
          this._timing.cycle[barIndex % this._timing.cycle.length];
        const sourceBar = source[barIndex % source.length];
        if (sourceBar.length === 0) return [];

        return timingBar.map(
          (_, hitIndex) => sourceBar[hitIndex % sourceBar.length],
        );
      }),
      mask: Array.from({ length: cycleLength }, (_, barIndex) =>
        getMask(this._timing.cycle[barIndex % this._timing.cycle.length]),
      ),
    };
  }
}

function getMask(timing: TimingPattern["cycle"][number]) {
  if (timing.length === 0) return [];

  const gridLength = Math.round(1 / timing[0].duration);
  return Array.from({ length: gridLength }, (_, stepIndex) =>
    timing.some((step) => Math.round(step.offset * gridLength) === stepIndex)
      ? 1
      : 0,
  );
}

function lowestCommonMultiple(a: number, b: number) {
  const product = a * b;
  if (!Number.isSafeInteger(product)) {
    throw new Error("[Pattern] Combined cycle length exceeds safe precision.");
  }
  return product / greatestCommonDivisor(a, b);
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

export default EventTiming;
