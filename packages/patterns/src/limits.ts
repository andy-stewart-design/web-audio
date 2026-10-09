import type { Cycle } from "./cycles/types";

const MAX_COMPILED_BARS = 1_024;
const MAX_COMPILED_EVENTS = 16_384;

// Expression nodes include structural wrappers as well as atoms and rests.
const MAX_EXPRESSION_NODES = 16_384;
const MAX_EXPRESSION_DEPTH = 128;
const MAX_SHORTHAND_SOURCE_LENGTH = 65_536;
const MAX_SHORTHAND_TOKENS = 16_384;

// Canonical event cycles count all normalized steps, including rests and
// continuations. Onset counts are consequently bounded by the step limit too.
const MAX_EVENT_CYCLE_PATTERNS = MAX_COMPILED_BARS;
const MAX_EVENT_CYCLE_STEPS = MAX_COMPILED_EVENTS;
const MAX_RATIONAL_DENOMINATOR = MAX_EVENT_CYCLE_STEPS;
const MAX_EVENT_GROUP_VOICES = 128;
const MAX_EVENT_CYCLE_VOICES = 65_536;
const MAX_RANDOM_EVENT_SETTINGS_ITEMS = 16_384;

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
  MAX_EXPRESSION_NODES,
  MAX_EXPRESSION_DEPTH,
  MAX_SHORTHAND_SOURCE_LENGTH,
  MAX_SHORTHAND_TOKENS,
  MAX_EVENT_CYCLE_PATTERNS,
  MAX_EVENT_CYCLE_STEPS,
  MAX_RATIONAL_DENOMINATOR,
  MAX_EVENT_GROUP_VOICES,
  MAX_EVENT_CYCLE_VOICES,
  MAX_RANDOM_EVENT_SETTINGS_ITEMS,
};
