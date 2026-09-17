import type { Cycle } from "../types";

const MAX_COMPILED_BARS = 1_024;
const MAX_COMPILED_EVENTS = 16_384;

function assertCycleLimits(cycle: Cycle<unknown>) {
  if (cycle.length > MAX_COMPILED_BARS) {
    throw new Error(
      `[Pattern] Transform produces more than ${MAX_COMPILED_BARS} bars.`,
    );
  }

  const eventCount = cycle.reduce((count, bar) => count + bar.length, 0);
  if (eventCount > MAX_COMPILED_EVENTS) {
    throw new Error(
      `[Pattern] Transform produces more than ${MAX_COMPILED_EVENTS} events.`,
    );
  }
}

export { assertCycleLimits, MAX_COMPILED_BARS, MAX_COMPILED_EVENTS };
