import {
  assertEventCycleInvariants,
  MAX_EVENT_CYCLE_PATTERNS,
  MAX_EVENT_CYCLE_STEPS,
  type RandomCycle,
  type RandomEventCycle,
  type RandomEventSettings,
  type StaticEventCycle,
} from "@web-audio/patterns";
import type { RandomNumberPattern } from "@web-audio/schema";

const REST = Object.freeze({ type: "rest" } as const);
const ONSET = Object.freeze({
  type: "event",
  values: Object.freeze([1] as const),
} as const);

/** Snapshot the public random authoring primitive, not legacy instrument state. */
function decodeRandomCandidateGeometry(source: RandomCycle) {
  // Public RandomCycle getters materialize any pending authored speed chain.
  // Copy that view immediately; never retain mutable source arrays in native IR.
  const current = source.current;
  if (current.length === 0 || current.length > MAX_EVENT_CYCLE_PATTERNS) {
    throw new Error(
      `[Fluid] Random inputs require 1 to ${MAX_EVENT_CYCLE_PATTERNS} patterns.`,
    );
  }
  let stepCount = 0;
  const zeroWidthPatterns: boolean[] = [];
  const patterns = current.map((bar, index) => {
    zeroWidthPatterns[index] = bar.length === 0;
    stepCount += Math.max(1, bar.length);
    if (stepCount > MAX_EVENT_CYCLE_STEPS) {
      throw new Error(
        `[Fluid] Random input contains more than ${MAX_EVENT_CYCLE_STEPS} steps.`,
      );
    }
    if (bar.length === 0) return Object.freeze([REST]);
    return Object.freeze(
      Array.from(bar, (value) => {
        // Rhythm applied to an empty authored bar can produce absent source
        // values. Existing random primitives treat those positions as silence.
        if (value !== 0 && value !== 1 && value !== undefined) {
          throw new Error("[Fluid] Random candidate steps must be binary.");
        }
        return value === 1 ? ONSET : REST;
      }),
    );
  });
  const cycle = Object.freeze({
    type: "static-event-cycle",
    patterns: Object.freeze(patterns),
  } as const satisfies StaticEventCycle<1>);
  assertEventCycleInvariants(cycle);
  return Object.freeze({
    cycle,
    zeroWidthPatterns: Object.freeze(zeroWidthPatterns),
  });
}

function decodeRandomCandidateCycle(source: RandomCycle) {
  return decodeRandomCandidateGeometry(source).cycle;
}

function decodeRandomEventInputGeometry(source: RandomCycle) {
  // Widen to the supported schema contract to retain optional value maps from
  // compatible random primitives, without generating or adapting static values.
  const schema: RandomNumberPattern = source.getRandomSchema();
  const geometry = decodeRandomCandidateGeometry(source);
  const candidateCycle = geometry.cycle;
  // Bound and validate source settings before cloning their arrays into native data.
  assertEventCycleInvariants({
    type: "random-event-cycle",
    candidateCycle,
    settings: schema,
  });
  const settings = Object.freeze({
    dataType: schema.dataType,
    segments: Object.freeze(
      schema.segments.map((segment) => Object.freeze({ ...segment })),
    ),
    range: schema.range ? Object.freeze({ ...schema.range }) : undefined,
    quantValue: schema.quantValue,
    algorithm: schema.algorithm,
    valueMap:
      schema.valueMap === undefined
        ? undefined
        : Object.freeze([...schema.valueMap]),
    order: schema.order,
  } satisfies RandomEventSettings);
  const cycle = Object.freeze({
    type: "random-event-cycle",
    candidateCycle,
    settings,
  } as const satisfies RandomEventCycle);
  assertEventCycleInvariants(cycle);
  return Object.freeze({
    cycle,
    zeroWidthPatterns: geometry.zeroWidthPatterns,
  });
}

function decodeRandomEventInput(source: RandomCycle) {
  return decodeRandomEventInputGeometry(source).cycle;
}

export {
  decodeRandomCandidateCycle,
  decodeRandomCandidateGeometry,
  decodeRandomEventInput,
  decodeRandomEventInputGeometry,
};
