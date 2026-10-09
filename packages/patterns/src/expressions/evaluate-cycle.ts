import type { EventPattern } from "../events/cycle";
import { assertEventCycleInvariants } from "../events/cycle";
import { normalizeEventPattern, type EventSpan } from "../events/grid";
import { MAX_EVENT_CYCLE_STEPS } from "../limits";
import {
  addRational,
  createRational,
  type Rational,
  parseRational,
  multiplyRational,
} from "../math/rational";
import { transformEventCycleSpeedRatio } from "../events/transforms";
import type { PatternRange } from "./model";
import type { NodeEvaluation, SpanPattern } from "./evaluate-types";

function scaleSpan<T>(
  span: EventSpan<T>,
  offset: Rational,
  duration: Rational,
) {
  return {
    offset: addRational(offset, multiplyRational(span.offset, duration)),
    duration: multiplyRational(span.duration, duration),
    step: span.step,
  };
}

function eventPatternToSpans<T>(pattern: EventPattern<T>) {
  const spans: SpanPattern<T> = [];
  let index = 0;
  while (index < pattern.length) {
    const step = pattern[index];
    const start = index;
    if (step.type === "event") {
      index++;
      while (index < pattern.length && pattern[index].type === "continuation") {
        index++;
      }
      spans.push({
        offset: createRational(start, pattern.length),
        duration: createRational(index - start, pattern.length),
        step: { type: "event", values: step.values },
      });
    } else if (step.type === "rest") {
      index++;
      while (index < pattern.length && pattern[index].type === "rest") index++;
      spans.push({
        offset: createRational(start, pattern.length),
        duration: createRational(index - start, pattern.length),
        step: { type: "rest" },
      });
    } else {
      throw new Error(
        "[Pattern] Event pattern contains an orphan continuation.",
      );
    }
  }
  return spans;
}

function transformSpanPatterns<T>(
  source: NodeEvaluation<T>,
  numerator: number,
  denominator: number,
  offset: Rational,
  duration: Rational,
) {
  const sourceCycle = Object.freeze({
    type: "static-event-cycle",
    patterns: Object.freeze(
      source.map((pattern, index) =>
        normalizeEventPattern(
          pattern,
          MAX_EVENT_CYCLE_STEPS -
            source
              .slice(0, index)
              .reduce((total, previous) => total + previous.length, 0),
        ),
      ),
    ),
  } as const);
  assertEventCycleInvariants(sourceCycle);
  const transformed = transformEventCycleSpeedRatio(
    sourceCycle,
    numerator,
    denominator,
  );
  return transformed.patterns.map((pattern) =>
    eventPatternToSpans(pattern).map((span) =>
      scaleSpan(span, offset, duration),
    ),
  );
}

function parsePositiveAmount(
  value: string,
  node: { readonly range?: PatternRange },
) {
  let amount: Rational;
  try {
    amount = parseRational(value);
  } catch (error) {
    throw expressionError(
      node,
      error instanceof Error
        ? error.message.replace(/^\[Pattern\] /, "")
        : String(error),
    );
  }
  if (amount.numerator <= 0) {
    throw expressionError(node, "Modifier amounts must be positive.");
  }
  return amount;
}

function parsePositiveInteger(
  value: string,
  node: { readonly range?: PatternRange },
) {
  const amount = parsePositiveAmount(value, node);
  if (amount.denominator !== 1) {
    throw expressionError(
      node,
      "Repeat amounts must be positive whole numbers.",
    );
  }
  if (amount.numerator > MAX_EVENT_CYCLE_STEPS) {
    throw expressionError(
      node,
      `Repeat amounts cannot exceed ${MAX_EVENT_CYCLE_STEPS}.`,
    );
  }
  return amount.numerator;
}

function expressionError(
  node: { readonly range?: PatternRange },
  message: string,
) {
  const location = node.range
    ? ` at source range [${node.range.start}, ${node.range.end})`
    : "";
  return new Error(`[Pattern] ${message}${location}`);
}

function greatestCommonDivisor(a: number, b: number) {
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

export {
  eventPatternToSpans,
  expressionError,
  greatestCommonDivisor,
  parsePositiveAmount,
  parsePositiveInteger,
  scaleSpan,
  transformSpanPatterns,
};
