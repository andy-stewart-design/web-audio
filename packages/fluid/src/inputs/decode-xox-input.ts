import {
  assertRandomGenerationMetadata,
  evaluatePatternExpression,
  MAX_SHORTHAND_SOURCE_LENGTH,
  parseShorthand,
  type PatternExpression,
  type PatternNode,
} from "@web-audio/patterns";
import { isRandomCycle } from "./guards";
import type { TimingChanceCondition } from "@/events/state";
import { decodeRandomCandidateGeometry } from "./decode-random-input";
import {
  decodeStructuredInput,
  decodeStructuredInputGeometry,
} from "./decode-structured-input";
import { interpretXoxAtom, targetAtomError } from "./atom-interpreters";

/** Structured numeric XOX retains the established nonzero-number mask behavior. */
function xoxDecodeOptions() {
  return {
    method: "[Instrument] xox()",
    allowNullRest: false,
    allowPolyphony: false,
    interpretValue: (value: unknown) => {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error("[Instrument] xox() values must be finite numbers.");
      }
      return value === 0
        ? ({ type: "rest" } as const)
        : ({ type: "event", value: 1 } as const);
    },
  } as const;
}

function decodeXoxExpression(input: readonly unknown[]) {
  return decodeStructuredInput<1>(input, xoxDecodeOptions());
}

function decodeCompactXoxExpression(source: string) {
  if (source.length > MAX_SHORTHAND_SOURCE_LENGTH) {
    throw targetAtomError(
      "[Instrument] xox()",
      `shorthand source exceeds the maximum length of ${MAX_SHORTHAND_SOURCE_LENGTH} UTF-16 code units`,
      { start: MAX_SHORTHAND_SOURCE_LENGTH, end: source.length },
    );
  }
  const nodes: PatternNode<string>[] = [];
  for (let index = 0; index < source.length; index++) {
    if (/\s/u.test(source[index])) continue;
    const character = source[index];
    const value = character.toLowerCase();
    if (value !== "x" && value !== "o" && value !== ".") return undefined;
    nodes.push({
      type: "atom",
      value: character,
      range: { start: index, end: index + 1 },
    });
  }
  if (nodes.length === 0) return undefined;
  const root =
    nodes.length === 1
      ? nodes[0]
      : {
          type: "sequence" as const,
          children: Object.freeze(nodes),
          range: {
            start: nodes[0].range!.start,
            end: nodes.at(-1)!.range!.end,
          },
        };
  return Object.freeze({
    type: "pattern-expression",
    patterns: Object.freeze([root]),
    range: { start: 0, end: source.length },
  } as const satisfies PatternExpression<string>);
}

function assertXoxExpressionShape(expression: PatternExpression<string>) {
  const stack = [...expression.patterns];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.type === "parallel") {
      throw targetAtomError(
        "[Instrument] xox()",
        "does not support simultaneous voice groups",
        node.range,
      );
    }
    if (node.type === "group" || node.type === "modifier") {
      stack.push(node.child);
    } else if (node.type === "sequence" || node.type === "alternate") {
      stack.push(...node.children);
    }
  }
}

function decodeXoxShorthandExpression(source: string) {
  if (source.trim() === "") {
    throw targetAtomError(
      "[Instrument] xox()",
      "shorthand expression cannot be empty; use '~' for silence",
    );
  }
  const compact = decodeCompactXoxExpression(source);
  const expression = compact ?? parseShorthand(source);
  assertXoxExpressionShape(expression);
  return expression;
}

function evaluateXoxShorthand(source: string) {
  return evaluatePatternExpression(
    decodeXoxShorthandExpression(source),
    interpretXoxAtom,
  );
}

function decodeXoxInputGeometry(input: readonly unknown[]) {
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
      ...decodeRandomCandidateGeometry(source),
      condition: snapshot,
    });
  }
  const geometry = decodeStructuredInputGeometry<1>(input, xoxDecodeOptions());
  return Object.freeze({
    cycle: evaluatePatternExpression(geometry.expression),
    zeroWidthPatterns: geometry.zeroWidthPatterns,
    condition: undefined,
  });
}

function decodeXoxInput(input: readonly unknown[]) {
  const { cycle, condition } = decodeXoxInputGeometry(input);
  return Object.freeze({ cycle, condition });
}

export {
  decodeXoxExpression,
  decodeXoxInput,
  decodeXoxInputGeometry,
  decodeXoxShorthandExpression,
  evaluateXoxShorthand,
};
