import type { RandomNumberPattern } from "@web-audio/schema";
import {
  MAX_EVENT_CYCLE_PATTERNS,
  MAX_EVENT_CYCLE_STEPS,
  MAX_EVENT_CYCLE_VOICES,
  MAX_EVENT_GROUP_VOICES,
  MAX_RANDOM_EVENT_SETTINGS_ITEMS,
} from "./utils/cycle-limits";
import { isPositiveInteger } from "./utils/validate";

/** @internal Simultaneous values in authored voice order, including duplicates. */
type NonEmptyGroup<T> = readonly [T, ...T[]];

/** @internal Canonical event state, not a user extension API. */
type EventCycle<T> =
  | StaticEventCycle<T>
  | (number extends T ? RandomEventCycle : never);

/** @internal One or more repeating, explicitly represented bars. */
type StaticEventCycle<T> = {
  readonly type: "static-event-cycle";
  readonly patterns: readonly EventPattern<T>[];
};

/** @internal Equal-width normalized steps; offsets and durations are derived. */
type EventPattern<T> = readonly EventStep<T>[];

/** @internal Continuations extend the preceding event, never a rest or prior bar. */
type EventStep<T> =
  | { readonly type: "event"; readonly values: NonEmptyGroup<T> }
  | { readonly type: "rest" }
  | { readonly type: "continuation" };

/** @internal Numeric generation settings, separate from fixed candidate geometry. */
type RandomEventSettings = {
  readonly dataType: RandomNumberPattern["dataType"];
  readonly segments: readonly Readonly<
    RandomNumberPattern["segments"][number]
  >[];
  readonly range?: Readonly<NonNullable<RandomNumberPattern["range"]>>;
  readonly quantValue?: number;
  readonly algorithm: RandomNumberPattern["algorithm"];
  readonly valueMap?: readonly number[];
  readonly order: RandomNumberPattern["order"];
};

/**
 * @internal Numeric-only source with fixed onset/rest geometry, not fake values.
 * Per-pattern value counts are derived from candidate onsets, not stored twice.
 * Runtime timing chance belongs to Fluid timing state, not numeric settings.
 */
type RandomEventCycle = {
  readonly type: "random-event-cycle";
  readonly candidateCycle: StaticEventCycle<1>;
  readonly settings: RandomEventSettings;
};

/** @internal Validate canonical structure without interpreting values or mutating it. */
function assertEventCycleInvariants(cycle: EventCycle<unknown>) {
  if (cycle.type === "static-event-cycle") {
    assertStaticEventCycleInvariants(cycle);
    return;
  }

  assertStaticEventCycleInvariants(cycle.candidateCycle);
  for (const [
    patternIndex,
    pattern,
  ] of cycle.candidateCycle.patterns.entries()) {
    for (const [stepIndex, step] of pattern.entries()) {
      if (
        step.type === "event" &&
        (step.values.length !== 1 || step.values[0] !== 1)
      ) {
        throw new Error(
          `[Pattern] Random candidate patterns[${patternIndex}][${stepIndex}] must contain exactly one onset value of 1.`,
        );
      }
    }
  }
  assertRandomEventSettings(cycle.settings);
}

function assertStaticEventCycleInvariants(cycle: StaticEventCycle<unknown>) {
  if (cycle.patterns.length === 0) {
    throw new Error("[Pattern] Event cycle must contain at least one pattern.");
  }
  if (cycle.patterns.length > MAX_EVENT_CYCLE_PATTERNS) {
    throw new Error(
      `[Pattern] Event cycle contains more than ${MAX_EVENT_CYCLE_PATTERNS} patterns.`,
    );
  }

  let stepCount = 0;
  let voiceCount = 0;
  for (const [patternIndex, pattern] of cycle.patterns.entries()) {
    if (pattern.length === 0) {
      throw new Error(
        `[Pattern] Event cycle patterns[${patternIndex}] must contain at least one step; use a rest for silence.`,
      );
    }
    stepCount += pattern.length;
    if (stepCount > MAX_EVENT_CYCLE_STEPS) {
      throw new Error(
        `[Pattern] Event cycle contains more than ${MAX_EVENT_CYCLE_STEPS} steps.`,
      );
    }

    let canContinue = false;
    for (const [stepIndex, step] of pattern.entries()) {
      const path = `patterns[${patternIndex}][${stepIndex}]`;
      const tag = step.type;
      switch (tag) {
        case "event":
          if (step.values.length === 0) {
            throw new Error(
              `[Pattern] Event cycle ${path} must contain a nonempty voice group.`,
            );
          }
          if (step.values.length > MAX_EVENT_GROUP_VOICES) {
            throw new Error(
              `[Pattern] Event cycle ${path} contains more than ${MAX_EVENT_GROUP_VOICES} voices.`,
            );
          }
          voiceCount += step.values.length;
          if (voiceCount > MAX_EVENT_CYCLE_VOICES) {
            throw new Error(
              `[Pattern] Event cycle contains more than ${MAX_EVENT_CYCLE_VOICES} voices.`,
            );
          }
          canContinue = true;
          break;
        case "rest":
          canContinue = false;
          break;
        case "continuation":
          if (!canContinue) {
            throw new Error(
              `[Pattern] Event cycle ${path} continuation must follow an event or continuation in the same pattern.`,
            );
          }
          break;
        default:
          throw new Error(
            `[Pattern] Event cycle ${path} has unsupported step type ${String(tag)}.`,
          );
      }
    }
  }
}

function assertRandomEventSettings(settings: RandomEventSettings) {
  if ("chance" in settings || "condition" in settings) {
    throw new Error(
      "[Pattern] Random event settings cannot contain a timing chance condition.",
    );
  }
  if (
    settings.dataType !== "float" &&
    settings.dataType !== "integer" &&
    settings.dataType !== "binary"
  ) {
    throw new Error("[Pattern] Random event settings dataType is invalid.");
  }
  assertRandomGenerationMetadata(settings);
  if (
    settings.range &&
    (!Number.isFinite(settings.range.min) ||
      !Number.isFinite(settings.range.max) ||
      !Number.isFinite(settings.range.max - settings.range.min))
  ) {
    throw new Error(
      "[Pattern] Random event settings range endpoints and span must be finite.",
    );
  }
  if (
    settings.quantValue !== undefined &&
    (!Number.isFinite(settings.quantValue) || settings.quantValue <= 0)
  ) {
    throw new Error(
      "[Pattern] Random event settings quantValue must be a positive finite number.",
    );
  }
  if (settings.valueMap !== undefined) {
    if (
      settings.valueMap.length === 0 ||
      (settings.dataType === "binary" && settings.valueMap.length < 2)
    ) {
      throw new Error(
        "[Pattern] Random event settings valueMap must contain safely indexable values.",
      );
    }
    if (settings.valueMap.length > MAX_RANDOM_EVENT_SETTINGS_ITEMS) {
      throw new Error(
        `[Pattern] Random event settings valueMap contains more than ${MAX_RANDOM_EVENT_SETTINGS_ITEMS} values.`,
      );
    }
    if (settings.valueMap.some((value) => !Number.isFinite(value))) {
      throw new Error(
        "[Pattern] Random event settings valueMap must contain only finite numbers.",
      );
    }
  }
}

/** @internal Shared seed/algorithm/order checks for numeric generation and timing chance. */
function assertRandomGenerationMetadata(
  settings: Pick<RandomEventSettings, "segments" | "algorithm" | "order">,
) {
  if (settings.algorithm !== "xor" && settings.algorithm !== "mulberry") {
    throw new Error("[Pattern] Random event settings algorithm is invalid.");
  }
  if (settings.order !== "forward" && settings.order !== "reverse") {
    throw new Error("[Pattern] Random event settings order is invalid.");
  }
  if (settings.segments.length === 0) {
    throw new Error(
      "[Pattern] Random event settings require at least one segment.",
    );
  }
  if (settings.segments.length > MAX_RANDOM_EVENT_SETTINGS_ITEMS) {
    throw new Error(
      `[Pattern] Random event settings contain more than ${MAX_RANDOM_EVENT_SETTINGS_ITEMS} segments.`,
    );
  }
  for (const [index, segment] of settings.segments.entries()) {
    if (!Number.isFinite(segment.seed)) {
      throw new Error(
        `[Pattern] Random event settings segments[${index}] seed must be finite.`,
      );
    }
    if (segment.len === undefined) {
      if (settings.segments.length !== 1) {
        throw new Error(
          "[Pattern] Random event settings may contain an unbounded segment only by itself.",
        );
      }
    } else if (!isPositiveInteger(segment.len)) {
      throw new Error(
        `[Pattern] Random event settings segments[${index}] length must be a positive finite integer.`,
      );
    }
  }
}

export { assertEventCycleInvariants, assertRandomGenerationMetadata };
export type {
  NonEmptyGroup,
  EventCycle,
  StaticEventCycle,
  RandomEventCycle,
  RandomEventSettings,
  EventPattern,
  EventStep,
};
