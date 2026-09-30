import { assertEventCycleInvariants } from "../event-cycle";
import type { EventPattern, EventStep, NonEmptyGroup } from "../event-cycle";
import {
  MAX_EVENT_CYCLE_STEPS,
  MAX_EVENT_CYCLE_VOICES,
  MAX_EVENT_GROUP_VOICES,
} from "./cycle-limits";
import {
  addRational,
  compareRational,
  createRational,
  leastCommonMultiple,
  rationalToGridIndex,
  type Rational,
} from "./rational";

/** Ordered, contiguous allocations covering one bar; transient evaluation data. */
type EventSpan<T> = {
  readonly offset: Rational;
  readonly duration: Rational;
  readonly step:
    | { readonly type: "event"; readonly values: NonEmptyGroup<T> }
    | { readonly type: "rest" };
};

const REST = Object.freeze({ type: "rest" } as const);
const CONTINUATION = Object.freeze({ type: "continuation" } as const);

function freezeGroup<T>(values: NonEmptyGroup<T>) {
  const [first, ...remaining] = values;
  // Freeze only structural data: opaque caller-owned payloads remain untouched.
  return Object.freeze([first, ...remaining] as const);
}

/** Smallest exact grid representing every event and explicit rest allocation. */
function normalizeEventPattern<T>(
  spans: readonly EventSpan<T>[],
  maxSteps = MAX_EVENT_CYCLE_STEPS,
) {
  if (
    !Number.isSafeInteger(maxSteps) ||
    maxSteps <= 0 ||
    maxSteps > MAX_EVENT_CYCLE_STEPS
  ) {
    throw new Error(
      `[Pattern] Grid step budget must be between 1 and ${MAX_EVENT_CYCLE_STEPS}.`,
    );
  }
  if (spans.length === 0) {
    throw new Error(
      "[Pattern] Event grid requires at least one allocation; use a rest for silence.",
    );
  }
  let offset = createRational(0);
  let resolution = 1;
  let voiceCount = 0;
  const zero = createRational(0);
  const one = createRational(1);
  for (const span of spans) {
    if (
      compareRational(span.offset, offset) !== 0 ||
      compareRational(span.duration, zero) <= 0
    ) {
      throw new Error(
        "[Pattern] Event grid allocations must be ordered, contiguous, and have positive durations.",
      );
    }
    offset = addRational(offset, span.duration);
    if (compareRational(offset, one) > 0) {
      throw new Error(
        "[Pattern] Event grid allocations cannot extend beyond one bar.",
      );
    }
    resolution = leastCommonMultiple(
      resolution,
      span.offset.denominator,
      maxSteps,
    );
    resolution = leastCommonMultiple(
      resolution,
      span.duration.denominator,
      maxSteps,
    );
    if (span.step.type === "event") {
      if (
        span.step.values.length === 0 ||
        span.step.values.length > MAX_EVENT_GROUP_VOICES
      ) {
        throw new Error(
          `[Pattern] Event grid groups require 1 to ${MAX_EVENT_GROUP_VOICES} voices.`,
        );
      }
      voiceCount += span.step.values.length;
      if (voiceCount > MAX_EVENT_CYCLE_VOICES) {
        throw new Error(
          `[Pattern] Event grid contains more than ${MAX_EVENT_CYCLE_VOICES} voices.`,
        );
      }
    }
  }
  if (compareRational(offset, one) !== 0) {
    throw new Error(
      "[Pattern] Event grid allocations must cover exactly one bar.",
    );
  }

  // Validate resolution and voice budgets before allocating the normalized grid.
  const steps: EventStep<T>[] = [];
  for (const span of spans) {
    const width = rationalToGridIndex(span.duration, resolution);
    if (span.step.type === "rest") {
      for (let index = 0; index < width; index++) steps.push(REST);
    } else {
      steps.push(
        Object.freeze({
          type: "event",
          values: freezeGroup(span.step.values),
        } as const),
      );
      for (let index = 1; index < width; index++) steps.push(CONTINUATION);
    }
  }
  return Object.freeze(steps);
}

/** @internal Derive transient exact onset geometry from indexes and continuation runs. */
function getEventPatternGeometry<T>(pattern: EventPattern<T>) {
  assertEventCycleInvariants({
    type: "static-event-cycle",
    patterns: [pattern],
  });
  const events: {
    readonly offset: Rational;
    readonly duration: Rational;
    readonly values: NonEmptyGroup<T>;
  }[] = [];
  for (let index = 0; index < pattern.length; index++) {
    const step = pattern[index];
    if (step.type !== "event") continue;
    let end = index + 1;
    while (end < pattern.length && pattern[end].type === "continuation") end++;
    events.push(
      Object.freeze({
        offset: createRational(index, pattern.length),
        duration: createRational(end - index, pattern.length),
        values: freezeGroup(step.values),
      }),
    );
    index = end - 1;
  }
  return Object.freeze(events);
}

export { normalizeEventPattern, getEventPatternGeometry };
export type { EventSpan };
