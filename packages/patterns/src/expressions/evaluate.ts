import {
  assertEventCycleInvariants,
  type EventPattern,
  type StaticEventCycle,
} from "../events/cycle";
import {
  MAX_EVENT_CYCLE_PATTERNS,
  MAX_EVENT_CYCLE_STEPS,
  MAX_EVENT_CYCLE_VOICES,
} from "../limits";
import { normalizeEventPattern } from "../events/grid";
import { createRational, type Rational } from "../math/rational";
import type { PatternExpression, PatternNode, PatternRange } from "./model";
import { assertPatternExpressionLimits } from "./model";
import {
  evaluateShorthandNode,
  prepareSequenceChildren,
} from "./evaluate-shorthand";
import { expressionError } from "./evaluate-cycle";
import { evaluateStructuralNode } from "./evaluate-structure";
import type {
  AtomInterpretation,
  AtomInterpreter,
  NodeEvaluation,
} from "./evaluate-types";

// Overloads preserve identity inference without casting an atom to a different
// callback result type. Extract only event values so a rest branch cannot widen
// the inferred payload to undefined.
function evaluatePatternExpression<T>(
  expression: PatternExpression<T>,
): StaticEventCycle<T>;
function evaluatePatternExpression<
  TAtom,
  TResult extends AtomInterpretation<unknown>,
>(
  expression: PatternExpression<TAtom>,
  interpretAtom: (value: TAtom, range?: PatternRange) => TResult,
): StaticEventCycle<Extract<TResult, { readonly type: "event" }>["value"]>;
function evaluatePatternExpression<TAtom, TValue>(
  expression: PatternExpression<TAtom>,
  interpretAtom?: AtomInterpreter<TAtom, TValue>,
) {
  assertPatternExpressionLimits(expression);
  if (expression.patterns.length === 0) {
    throw expressionError(
      expression,
      "Expression must contain at least one pattern; use a rest for silence.",
    );
  }
  if (expression.patterns.length > MAX_EVENT_CYCLE_PATTERNS) {
    throw expressionError(
      expression,
      `Expression contains more than ${MAX_EVENT_CYCLE_PATTERNS} patterns.`,
    );
  }
  const interpret: AtomInterpreter<TAtom, TAtom | TValue> = (value, range) =>
    interpretAtom ? interpretAtom(value, range) : { type: "event", value };
  const patterns: EventPattern<TAtom | TValue>[] = [];
  let stepCount = 0;
  let voiceCount = 0;
  for (const node of expression.patterns) {
    const evaluations = evaluateNode(
      node,
      createRational(0),
      createRational(1),
      interpret,
    );
    if (patterns.length + evaluations.length > MAX_EVENT_CYCLE_PATTERNS) {
      throw expressionError(
        node,
        `Expression evaluates to more than ${MAX_EVENT_CYCLE_PATTERNS} patterns.`,
      );
    }
    for (const spans of evaluations) {
      for (const span of spans) {
        if (span.step.type === "event") voiceCount += span.step.values.length;
      }
      if (voiceCount > MAX_EVENT_CYCLE_VOICES) {
        throw expressionError(
          node,
          `Event cycle contains more than ${MAX_EVENT_CYCLE_VOICES} voices.`,
        );
      }
      if (stepCount === MAX_EVENT_CYCLE_STEPS) {
        throw expressionError(
          node,
          `Event cycle contains more than ${MAX_EVENT_CYCLE_STEPS} steps.`,
        );
      }
      const pattern = normalizeEventPattern(
        spans,
        MAX_EVENT_CYCLE_STEPS - stepCount,
      );
      stepCount += pattern.length;
      patterns.push(pattern);
    }
  }
  const cycle = Object.freeze({
    type: "static-event-cycle",
    patterns: Object.freeze(patterns),
  } as const);
  assertEventCycleInvariants(cycle);
  return cycle;

  function evaluateNode(
    node: PatternNode<TAtom>,
    offset: Rational,
    duration: Rational,
    interpret: AtomInterpreter<TAtom, TAtom | TValue>,
  ): NodeEvaluation<TAtom | TValue> {
    if (node.type === "alternate" || node.type === "modifier") {
      return evaluateShorthandNode(
        node,
        offset,
        duration,
        interpret,
        evaluateNode,
        prepareSequenceChildren,
      );
    }
    return evaluateStructuralNode(
      node,
      offset,
      duration,
      interpret,
      evaluateNode,
      prepareSequenceChildren,
    );
  }
}

export { evaluatePatternExpression };
export type { AtomInterpretation, AtomInterpreter } from "./evaluate-types";
