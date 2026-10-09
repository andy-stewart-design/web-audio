import { MAX_EVENT_CYCLE_PATTERNS, MAX_EVENT_CYCLE_STEPS } from "../limits";
import {
  createRational,
  divideRational,
  leastCommonMultiple,
  multiplyRational,
  type Rational,
} from "../math/rational";
import type { PatternNode } from "./model";
import {
  expressionError,
  greatestCommonDivisor,
  parsePositiveAmount,
  parsePositiveInteger,
  scaleSpan,
  transformSpanPatterns,
} from "./evaluate-cycle";
import { evaluateSequence } from "./evaluate-structure";
import type {
  AtomInterpreter,
  EvaluateNode,
  NodeEvaluation,
  PrepareSequenceChildren,
  PreparedSequenceChild,
  SpanPattern,
} from "./evaluate-types";
import type { PatternRange } from "./model";

function prepareSequenceChildren<T>(
  children: readonly PatternNode<T>[],
  source: { readonly range?: PatternRange },
) {
  const expanded: PatternNode<T>[] = [];
  for (const child of children) {
    if (child.type !== "modifier" || child.operator !== "repeat") {
      expanded.push(child);
      continue;
    }
    const count = parsePositiveInteger(child.amount, child);
    if (count > MAX_EVENT_CYCLE_STEPS - expanded.length) {
      throw expressionError(
        source,
        `Repetition expands to more than ${MAX_EVENT_CYCLE_STEPS} sequence items.`,
      );
    }
    for (let index = 0; index < count; index++) expanded.push(child.child);
  }
  return expanded.map((child): PreparedSequenceChild<T> => {
    if (child.type === "modifier" && child.operator === "weight") {
      return {
        node: child.child,
        weight: parsePositiveAmount(child.amount, child),
      };
    }
    return { node: child, weight: createRational(1) };
  });
}

function evaluateShorthandNode<TAtom, TValue>(
  node: Extract<
    PatternNode<TAtom>,
    { readonly type: "alternate" | "modifier" }
  >,
  offset: Rational,
  duration: Rational,
  interpretAtom: AtomInterpreter<TAtom, TValue>,
  evaluateNode: EvaluateNode<TAtom, TValue>,
  prepareSequenceChildren: PrepareSequenceChildren,
): NodeEvaluation<TValue> {
  if (node.type === "alternate") {
    return evaluateAlternate(
      node,
      offset,
      duration,
      interpretAtom,
      evaluateNode,
    );
  }

  switch (node.operator) {
    case "repeat": {
      const count = parsePositiveInteger(node.amount, node);
      return evaluateSequence(
        Array.from({ length: count }, () => node.child),
        offset,
        duration,
        interpretAtom,
        evaluateNode,
        prepareSequenceChildren,
        node,
      );
    }
    case "accelerate":
    case "slow":
      return evaluateSpeedChain(
        node,
        offset,
        duration,
        interpretAtom,
        evaluateNode,
      );
    case "weight":
      return evaluateNode(node.child, offset, duration, interpretAtom);
    default: {
      const unsupported: never = node.operator;
      throw expressionError(unsupported, "Unsupported modifier operator.");
    }
  }
}

function evaluateAlternate<TAtom, TValue>(
  node: Extract<PatternNode<TAtom>, { readonly type: "alternate" }>,
  offset: Rational,
  duration: Rational,
  interpretAtom: AtomInterpreter<TAtom, TValue>,
  evaluateNode: EvaluateNode<TAtom, TValue>,
) {
  if (node.children.length === 0) {
    throw expressionError(
      node,
      "Alternations cannot be empty; use a rest for silence.",
    );
  }
  const choices = node.children.map((child) => {
    if (child.type === "modifier" && child.operator === "weight") {
      return {
        evaluation: evaluateNode(
          child.child,
          createRational(0),
          createRational(1),
          interpretAtom,
        ),
        weight: parsePositiveAmount(child.amount, child),
      };
    }
    return {
      evaluation: evaluateNode(
        child,
        createRational(0),
        createRational(1),
        interpretAtom,
      ),
      weight: createRational(1),
    };
  });

  let weightScale = 1;
  for (const choice of choices) {
    weightScale = leastCommonMultiple(
      weightScale,
      choice.weight.denominator,
      MAX_EVENT_CYCLE_PATTERNS,
    );
  }
  const counts = choices.map((choice) => {
    const count =
      BigInt(choice.weight.numerator) *
      BigInt(weightScale / choice.weight.denominator);
    if (count <= 0n || count > BigInt(MAX_EVENT_CYCLE_PATTERNS)) {
      throw expressionError(
        node,
        `Alternation weight expands beyond ${MAX_EVENT_CYCLE_PATTERNS} choices.`,
      );
    }
    return Number(count);
  });
  const schedule: number[] = [];
  counts.forEach((count, choiceIndex) => {
    if (schedule.length + count > MAX_EVENT_CYCLE_PATTERNS) {
      throw expressionError(
        node,
        `Alternation expands beyond ${MAX_EVENT_CYCLE_PATTERNS} patterns.`,
      );
    }
    for (let index = 0; index < count; index++) schedule.push(choiceIndex);
  });

  let rounds = 1;
  counts.forEach((count, choiceIndex) => {
    const period = choices[choiceIndex].evaluation.length;
    rounds = leastCommonMultiple(
      rounds,
      period / greatestCommonDivisor(period, count),
      MAX_EVENT_CYCLE_PATTERNS,
    );
  });
  if (schedule.length * rounds > MAX_EVENT_CYCLE_PATTERNS) {
    throw expressionError(
      node,
      `Alternation expands beyond ${MAX_EVENT_CYCLE_PATTERNS} patterns.`,
    );
  }

  const cursors = Array<number>(choices.length).fill(0);
  const patterns: SpanPattern<TValue>[] = [];
  for (let round = 0; round < rounds; round++) {
    for (const choiceIndex of schedule) {
      const choice = choices[choiceIndex];
      const selected =
        choice.evaluation[cursors[choiceIndex]++ % choice.evaluation.length];
      patterns.push(selected.map((span) => scaleSpan(span, offset, duration)));
    }
  }
  return patterns;
}

function evaluateSpeedChain<TAtom, TValue>(
  node: Extract<PatternNode<TAtom>, { readonly type: "modifier" }>,
  offset: Rational,
  duration: Rational,
  interpretAtom: AtomInterpreter<TAtom, TValue>,
  evaluateNode: EvaluateNode<TAtom, TValue>,
) {
  let base: PatternNode<TAtom> = node;
  let ratio = createRational(1);
  while (
    base.type === "modifier" &&
    (base.operator === "accelerate" || base.operator === "slow")
  ) {
    const amount = parsePositiveAmount(base.amount, base);
    ratio = multiplyRational(
      ratio,
      base.operator === "accelerate"
        ? amount
        : divideRational(createRational(1), amount),
    );
    base = base.child;
  }

  const source = evaluateNode(
    base,
    createRational(0),
    createRational(1),
    interpretAtom,
  );
  if (ratio.numerator === ratio.denominator) {
    return source.map((pattern) =>
      pattern.map((span) => scaleSpan(span, offset, duration)),
    );
  }
  return transformSpanPatterns(
    source,
    ratio.numerator,
    ratio.denominator,
    offset,
    duration,
  );
}

export { evaluateShorthandNode, prepareSequenceChildren };
