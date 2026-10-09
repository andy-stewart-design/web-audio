import {
  MAX_EVENT_CYCLE_PATTERNS,
  MAX_EVENT_CYCLE_STEPS,
  MAX_EVENT_GROUP_VOICES,
} from "../limits";
import type { PatternNode, PatternRange } from "./model";
import { expressionError } from "./evaluate-cycle";
import type {
  AtomInterpreter,
  EvaluateNode,
  NodeEvaluation,
  PrepareSequenceChildren,
} from "./evaluate-types";
import {
  addRational,
  createRational,
  divideRational,
  leastCommonMultiple,
  multiplyRational,
  type Rational,
} from "../math/rational";

function evaluateStructuralNode<TAtom, TValue>(
  node: Exclude<
    PatternNode<TAtom>,
    { readonly type: "alternate" | "modifier" }
  >,
  offset: Rational,
  duration: Rational,
  interpretAtom: AtomInterpreter<TAtom, TValue>,
  evaluateNode: EvaluateNode<TAtom, TValue>,
  prepareSequenceChildren: PrepareSequenceChildren,
): NodeEvaluation<TValue> {
  switch (node.type) {
    case "atom": {
      const interpreted = interpretAtom(node.value, node.range);
      return [
        [
          {
            offset,
            duration,
            step:
              interpreted.type === "rest"
                ? { type: "rest" }
                : { type: "event", values: [interpreted.value] },
          },
        ],
      ];
    }
    case "rest":
      return [[{ offset, duration, step: { type: "rest" } }]];
    case "group":
      return evaluateNode(node.child, offset, duration, interpretAtom);
    case "sequence":
      return evaluateSequence(
        node.children,
        offset,
        duration,
        interpretAtom,
        evaluateNode,
        prepareSequenceChildren,
        node,
      );
    case "parallel": {
      const values: TValue[] = [];
      appendVoices(node, interpretAtom, values);
      const [first, ...remaining] = values;
      return [
        [
          {
            offset,
            duration,
            step: { type: "event", values: [first, ...remaining] },
          },
        ],
      ];
    }
    default: {
      const unsupported: never = node;
      throw expressionError(unsupported, "Unsupported expression node.");
    }
  }
}

function evaluateSequence<TAtom, TValue>(
  children: readonly PatternNode<TAtom>[],
  offset: Rational,
  duration: Rational,
  interpretAtom: AtomInterpreter<TAtom, TValue>,
  evaluateNode: EvaluateNode<TAtom, TValue>,
  prepareSequenceChildren: PrepareSequenceChildren,
  source: { readonly range?: PatternRange },
) {
  if (children.length === 0) {
    throw expressionError(
      source,
      "Sequences cannot be empty; use a rest for silence.",
    );
  }
  const weighted = prepareSequenceChildren(children, source);
  const totalWeight = weighted.reduce(
    (total, child) => addRational(total, child.weight),
    createRational(0),
  );
  const evaluations: NodeEvaluation<TValue>[] = [];
  let evaluatedSpanCount = 0;
  let childOffset = offset;
  for (const child of weighted) {
    const childDuration = multiplyRational(
      duration,
      divideRational(child.weight, totalWeight),
    );
    const result = evaluateNode(
      child.node,
      childOffset,
      childDuration,
      interpretAtom,
    );
    evaluatedSpanCount += result.reduce(
      (total, pattern) => total + pattern.length,
      0,
    );
    if (evaluatedSpanCount > MAX_EVENT_CYCLE_STEPS) {
      throw expressionError(
        source,
        `Sequence expands to more than ${MAX_EVENT_CYCLE_STEPS} steps.`,
      );
    }
    evaluations.push(result);
    childOffset = addRational(childOffset, childDuration);
  }

  let patternCount = 1;
  for (const evaluation of evaluations) {
    patternCount = leastCommonMultiple(
      patternCount,
      evaluation.length,
      MAX_EVENT_CYCLE_PATTERNS,
    );
  }

  // Every span contributes at least one normalized step. Check the complete
  // phrase before flatMap can allocate the cross-product of child patterns.
  let expandedSpanCount = 0;
  for (const evaluation of evaluations) {
    const repetitions = patternCount / evaluation.length;
    const spanCount = evaluation.reduce(
      (total, pattern) => total + pattern.length,
      0,
    );
    expandedSpanCount += repetitions * spanCount;
    if (expandedSpanCount > MAX_EVENT_CYCLE_STEPS) {
      throw expressionError(
        source,
        `Sequence expands to more than ${MAX_EVENT_CYCLE_STEPS} steps.`,
      );
    }
  }

  return Array.from({ length: patternCount }, (_, patternIndex) =>
    evaluations.flatMap(
      (evaluation) => evaluation[patternIndex % evaluation.length],
    ),
  );
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
      for (const child of node.children) {
        appendVoices(child, interpretAtom, values);
      }
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

export { appendVoices, evaluateSequence, evaluateStructuralNode };
