import { assertEventCycleInvariants } from "../events/cycle";
import type { EventPattern, StaticEventCycle } from "../events/cycle";
import { assertPatternExpressionLimits } from "./model";
import type { PatternExpression, PatternNode, PatternRange } from "./model";
import {
  MAX_EVENT_CYCLE_PATTERNS,
  MAX_EVENT_CYCLE_STEPS,
  MAX_EVENT_CYCLE_VOICES,
  MAX_EVENT_GROUP_VOICES,
} from "../limits";
import { normalizeEventPattern, type EventSpan } from "../events/grid";
import {
  addRational,
  createRational,
  divideRational,
  type Rational,
} from "../math/rational";

/** Tagged results allow any opaque value, including null, without a rest sentinel. */
type AtomInterpretation<T> =
  | { readonly type: "event"; readonly value: T }
  | { readonly type: "rest" };

type AtomInterpreter<TAtom, TValue> = (
  value: TAtom,
  range?: PatternRange,
) => AtomInterpretation<TValue>;

// Overloads preserve identity inference without casting an atom to a different
// callback result type. Extract only event values so a rest branch cannot widen
// the inferred payload to undefined.
/** @internal Evaluate with a pure interpreter; freeze structure, not opaque payloads. */
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
  const interpret = (value: TAtom, range?: PatternRange) =>
    interpretAtom
      ? interpretAtom(value, range)
      : { type: "event" as const, value };
  const patterns: EventPattern<TAtom | TValue>[] = [];
  let stepCount = 0;
  let voiceCount = 0;
  for (const node of expression.patterns) {
    const spans: EventSpan<TAtom | TValue>[] = [];
    evaluateNode(node, createRational(0), createRational(1), interpret, spans);
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
  const cycle = Object.freeze({
    type: "static-event-cycle",
    patterns: Object.freeze(patterns),
  } as const);
  assertEventCycleInvariants(cycle);
  return cycle;
}

function evaluateNode<TAtom, TValue>(
  node: PatternNode<TAtom>,
  offset: Rational,
  duration: Rational,
  interpretAtom: AtomInterpreter<TAtom, TValue>,
  spans: EventSpan<TValue>[],
) {
  switch (node.type) {
    case "atom": {
      const interpreted = interpretAtom(node.value, node.range);
      spans.push({
        offset,
        duration,
        step:
          interpreted.type === "rest"
            ? { type: "rest" }
            : { type: "event", values: [interpreted.value] },
      });
      break;
    }
    case "rest":
      spans.push({ offset, duration, step: { type: "rest" } });
      break;
    case "group":
      evaluateNode(node.child, offset, duration, interpretAtom, spans);
      break;
    case "sequence": {
      if (node.children.length === 0) {
        throw expressionError(
          node,
          "Sequences cannot be empty; use a rest for silence.",
        );
      }
      const width = divideRational(
        duration,
        createRational(node.children.length),
      );
      let childOffset = offset;
      for (const child of node.children) {
        evaluateNode(child, childOffset, width, interpretAtom, spans);
        childOffset = addRational(childOffset, width);
      }
      break;
    }
    case "parallel": {
      const values: TValue[] = [];
      appendVoices(node, interpretAtom, values);
      const [first, ...remaining] = values;
      spans.push({
        offset,
        duration,
        step: { type: "event", values: [first, ...remaining] },
      });
      break;
    }
    case "alternate":
      throw expressionError(
        node,
        "Alternation evaluation is not supported yet.",
      );
    case "modifier":
      throw expressionError(node, "Modifier evaluation is not supported yet.");
    default: {
      const unsupported: never = node;
      throw expressionError(unsupported, "Unsupported expression node.");
    }
  }
}

function appendVoices<TAtom, TValue>(
  node: PatternNode<TAtom>,
  interpretAtom: AtomInterpreter<TAtom, TValue>,
  values: TValue[],
) {
  switch (node.type) {
    case "atom": {
      const interpreted = interpretAtom(node.value, node.range);
      if (interpreted.type === "rest") {
        throw expressionError(node, "Rests cannot be simultaneous voices.");
      }
      if (values.length === MAX_EVENT_GROUP_VOICES) {
        throw expressionError(
          node,
          `Simultaneous groups cannot contain more than ${MAX_EVENT_GROUP_VOICES} voices.`,
        );
      }
      values.push(interpreted.value);
      break;
    }
    case "group":
      appendVoices(node.child, interpretAtom, values);
      break;
    case "parallel":
      if (node.children.length === 0) {
        throw expressionError(
          node,
          "Simultaneous voice groups cannot be empty.",
        );
      }
      for (const child of node.children)
        appendVoices(child, interpretAtom, values);
      break;
    case "rest":
      throw expressionError(node, "Rests cannot be simultaneous voices.");
    default:
      throw expressionError(
        node,
        "Simultaneous voices must be atoms or grouped simultaneous voices, not sequential or time-varying structures.",
      );
  }
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

export { evaluatePatternExpression };
export type { AtomInterpretation, AtomInterpreter };
