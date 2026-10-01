import {
  assertRandomGenerationMetadata,
  evaluatePatternExpression,
} from "@web-audio/patterns";
import { isRandomCycle } from "@/utils/validate";
import type { TimingChanceCondition } from "@/types";
import { decodeRandomCandidateCycle } from "./decode-random-input";
import { decodeStructuredInput } from "./decode-structured-input";

/** Structured numeric XOX retains the established nonzero-number mask behavior. */
function decodeXoxExpression(input: readonly unknown[]) {
  return decodeStructuredInput<1>(input, {
    method: "[Instrument] xox()",
    allowNullRest: false,
    allowPolyphony: false,
    interpretValue: (value) => {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error("[Instrument] xox() values must be finite numbers.");
      }
      return value === 0
        ? { type: "rest" }
        : { type: "event", value: 1 as const };
    },
  });
}

function decodeXoxInput(input: readonly unknown[]) {
  if (input.length === 1 && isRandomCycle(input[0])) {
    const source = input[0];
    if (source.dataType !== "binary") {
      throw new Error("Instrument.xox() random masks must be binary");
    }
    const condition = source.getTimingCondition();
    assertRandomGenerationMetadata(condition);
    if (
      !Number.isFinite(condition.probability) ||
      condition.probability < 0 ||
      condition.probability > 1
    ) {
      throw new Error(
        "[Instrument] xox() chance probability must be a finite number from 0 to 1.",
      );
    }
    const snapshot = Object.freeze({
      ...condition,
      segments: Object.freeze(
        condition.segments.map((segment) => Object.freeze({ ...segment })),
      ),
    } satisfies TimingChanceCondition);
    // Keep raw geometry and probability boundaries until compilation. A fixed
    // replacement has no new condition, so transitions can retain prior chance
    // metadata, matching existing rhythm composition semantics.
    return Object.freeze({
      cycle: decodeRandomCandidateCycle(source),
      condition: snapshot,
    });
  }
  return Object.freeze({
    cycle: evaluatePatternExpression(decodeXoxExpression(input)),
    condition: undefined,
  });
}

export { decodeXoxExpression, decodeXoxInput };
