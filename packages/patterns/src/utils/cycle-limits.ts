import type { Cycle } from "../types";

const MAX_COMPILED_BARS = 1_024;
const MAX_COMPILED_EVENTS = 16_384;

function assertCycleBarLimit(barCount: number) {
  if (barCount > MAX_COMPILED_BARS) {
    throw new Error(
      `[Pattern] Transform produces more than ${MAX_COMPILED_BARS} bars.`,
    );
  }
}

function assertCycleLimits(cycle: Cycle<unknown>) {
  assertCycleBarLimit(cycle.length);

  const eventCount = cycle.reduce((count, bar) => count + bar.length, 0);
  if (eventCount > MAX_COMPILED_EVENTS) {
    throw new Error(
      `[Pattern] Transform produces more than ${MAX_COMPILED_EVENTS} events.`,
    );
  }
}

export {
  assertCycleBarLimit,
  assertCycleLimits,
  MAX_COMPILED_BARS,
  MAX_COMPILED_EVENTS,
};
