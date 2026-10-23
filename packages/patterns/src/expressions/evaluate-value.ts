import {
  MAX_VALUE_ALTERNATION_CHOICES,
  MAX_VALUE_CYCLE_BARS,
  MAX_VALUE_CYCLE_VALUES,
  MAX_VALUE_SEQUENCE_CHILDREN,
} from "../limits";
import { parseRational } from "../math/rational";
import type { PatternExpression, PatternNode, PatternRange } from "./model";
import { assertPatternExpressionLimits } from "./model";

/** Numeric bars produced by value-pattern evaluation. */
type NumericBars = readonly (readonly number[])[];
/**
 * Pure, deterministic atom interpretation supplied by the value caller.
 * Invocation count and order are intentionally unspecified because structural
 * expansion may interpret the same atom more than once.
 */
type ValueAtomInterpreter<TAtom> = (
  value: TAtom,
  range?: PatternRange,
) => number;

type ValueCycle = {
  readonly bars: NumericBars;
  readonly values: number;
};

type Choice<TAtom> = {
  readonly node: PatternNode<TAtom>;
  readonly count: number;
};

function evaluateValuePatternExpression<TAtom>(
  expression: PatternExpression<TAtom>,
  interpretAtom: ValueAtomInterpreter<TAtom>,
) {
  assertPatternExpressionLimits(expression);
  if (expression.patterns.length === 0) {
    throw expressionError(
      expression,
      "Expression must contain at least one pattern.",
    );
  }
  if (expression.patterns.length > MAX_VALUE_CYCLE_BARS) {
    throw expressionError(
      expression,
      `Expression contains more than ${MAX_VALUE_CYCLE_BARS} patterns.`,
    );
  }

  const evaluated: ValueCycle[] = [];
  let barCount = 0;
  let valueCount = 0;
  // This budget belongs to this output expression, never to evaluator work
  // or to a later independent evaluation.
  for (const node of expression.patterns) {
    const cycle = evaluateNode(node, interpretAtom);
    evaluated.push(cycle);
    barCount += cycle.bars.length;
    assertBarCount(barCount, expression);
    valueCount += cycle.values;
    assertValueCount(valueCount, expression);
  }

  const bars = evaluated.flatMap((cycle) => cycle.bars);
  return Object.freeze(bars);
}

function evaluateNode<TAtom>(
  node: PatternNode<TAtom>,
  interpretAtom: ValueAtomInterpreter<TAtom>,
): ValueCycle {
  switch (node.type) {
    case "atom": {
      const value = interpretAtom(node.value, node.range);
      if (!Number.isFinite(value)) {
        throw expressionError(node, "Numeric atoms must be finite.");
      }
      return cycle([[value]]);
    }
    case "rest":
      throw expressionError(
        node,
        "Rests are not supported in numeric patterns.",
      );
    case "parallel":
      throw expressionError(
        node,
        "Parallel groups are not supported in numeric patterns.",
      );
    case "group":
      return evaluateNode(node.child, interpretAtom);
    case "sequence":
      return evaluateSequence(node, interpretAtom);
    case "alternate":
      return evaluateAlternate(node, interpretAtom);
    case "modifier":
      if (node.operator !== "repeat") {
        throw expressionError(
          node,
          `Modifier '${node.operator}' is not supported in numeric patterns.`,
        );
      }
      return evaluateRepeat(node, interpretAtom);
    default: {
      const unsupported: never = node;
      throw expressionError(unsupported, "Unsupported expression node.");
    }
  }
}

function evaluateRepeat<TAtom>(
  node: Extract<PatternNode<TAtom>, { readonly type: "modifier" }>,
  interpretAtom: ValueAtomInterpreter<TAtom>,
) {
  const count = parsePositiveInteger(node.amount, node);
  const child = evaluateNode(node.child, interpretAtom);
  if (child.values > Math.floor(MAX_VALUE_CYCLE_VALUES / count)) {
    throw expressionError(
      node,
      `Numeric pattern contains more than ${MAX_VALUE_CYCLE_VALUES} values.`,
    );
  }
  const bars = child.bars.map((bar) =>
    Object.freeze(Array.from({ length: count }, () => bar).flat()),
  );
  return cycle(bars, child.values * count);
}

function evaluateSequence<TAtom>(
  node: Extract<PatternNode<TAtom>, { readonly type: "sequence" }>,
  interpretAtom: ValueAtomInterpreter<TAtom>,
) {
  const children = expandSequenceChildren(node.children, node);
  if (children.length === 0) {
    throw expressionError(node, "Sequences cannot be empty.");
  }

  const evaluations: ValueCycle[] = [];
  let barCount = 1;
  for (const child of children) {
    const evaluation = evaluateNode(child, interpretAtom);
    evaluations.push(evaluation);
    barCount = leastCommonMultiple(
      barCount,
      evaluation.bars.length,
      MAX_VALUE_CYCLE_BARS,
      node,
    );

    // The current children are a lower bound for the eventual parent: later
    // children can only add values, and can increase the common bar period.
    const lowerBound = evaluations.reduce(
      (total, current) =>
        total + current.values * (barCount / current.bars.length),
      0,
    );
    assertValueCount(lowerBound, node);
  }

  const values = evaluations.reduce(
    (total, evaluation) =>
      total + evaluation.values * (barCount / evaluation.bars.length),
    0,
  );
  assertValueCount(values, node);
  assertBarCount(barCount, node);

  const bars = Array.from({ length: barCount }, (_, barIndex) =>
    Object.freeze(
      evaluations.flatMap(
        (evaluation) => evaluation.bars[barIndex % evaluation.bars.length],
      ),
    ),
  );
  return cycle(bars, values);
}

function expandSequenceChildren<TAtom>(
  children: readonly PatternNode<TAtom>[],
  source: { readonly range?: PatternRange },
) {
  let expandedCount = 0;
  for (const child of children) {
    const count =
      child.type === "modifier" && child.operator === "repeat"
        ? parsePositiveInteger(child.amount, child)
        : 1;
    if (count > MAX_VALUE_SEQUENCE_CHILDREN - expandedCount) {
      throw expressionError(
        source,
        `Sequence expands to more than ${MAX_VALUE_SEQUENCE_CHILDREN} items.`,
      );
    }
    expandedCount += count;
  }

  const expanded: PatternNode<TAtom>[] = [];
  for (const child of children) {
    if (child.type === "modifier" && child.operator === "repeat") {
      for (
        let index = 0;
        index < parsePositiveInteger(child.amount, child);
        index++
      ) {
        expanded.push(child.child);
      }
    } else {
      expanded.push(child);
    }
  }
  return expanded;
}

function evaluateAlternate<TAtom>(
  node: Extract<PatternNode<TAtom>, { readonly type: "alternate" }>,
  interpretAtom: ValueAtomInterpreter<TAtom>,
) {
  if (node.children.length === 0) {
    throw expressionError(node, "Alternations cannot be empty.");
  }

  const choices = node.children.map((child) => {
    let choice = child;
    let count = 1;
    while (choice.type === "modifier" && choice.operator === "repeat") {
      const repeat = parsePositiveInteger(choice.amount, choice);
      if (repeat > MAX_VALUE_ALTERNATION_CHOICES / count) {
        throw expressionError(
          choice,
          `Alternation expands beyond ${MAX_VALUE_ALTERNATION_CHOICES} choices.`,
        );
      }
      count *= repeat;
      choice = choice.child;
    }
    return { node: choice, count } satisfies Choice<TAtom>;
  });

  const scheduleLength = choices.reduce((total, choice) => {
    if (choice.count > MAX_VALUE_ALTERNATION_CHOICES - total) {
      throw expressionError(
        node,
        `Alternation expands beyond ${MAX_VALUE_ALTERNATION_CHOICES} choices.`,
      );
    }
    return total + choice.count;
  }, 0);

  const evaluated: (Choice<TAtom> & { readonly cycle: ValueCycle })[] = [];
  let rounds = 1;
  for (const choice of choices) {
    const cycle = evaluateNode(choice.node, interpretAtom);
    evaluated.push({ ...choice, cycle });
    const period = cycle.bars.length;
    rounds = leastCommonMultiple(
      rounds,
      period / greatestCommonDivisor(period, choice.count),
      Math.floor(MAX_VALUE_CYCLE_BARS / scheduleLength),
      node,
    );

    // Future choices can only add schedule rounds, so this is a lower bound
    // for the same alternation result that will eventually be emitted.
    const lowerBound = evaluated.reduce(
      (total, current) =>
        total +
        current.cycle.values *
          ((current.count * rounds) / current.cycle.bars.length),
      0,
    );
    assertValueCount(lowerBound, node);
  }

  const barCount = scheduleLength * rounds;
  assertBarCount(barCount, node);
  const values = evaluated.reduce(
    (total, choice) =>
      total +
      choice.cycle.values *
        ((choice.count * rounds) / choice.cycle.bars.length),
    0,
  );
  assertValueCount(values, node);

  const schedule = evaluated.flatMap((choice, choiceIndex) =>
    Array.from({ length: choice.count }, () => choiceIndex),
  );
  const cursors = Array<number>(evaluated.length).fill(0);
  const bars: NumericBars = Array.from({ length: rounds }, () => []).flatMap(
    () =>
      schedule.map((choiceIndex) => {
        const choice = evaluated[choiceIndex];
        const bar =
          choice.cycle.bars[cursors[choiceIndex]++ % choice.cycle.bars.length];
        return bar;
      }),
  );
  return cycle(bars, values);
}

function parsePositiveInteger(
  value: string,
  node: { readonly range?: PatternRange },
) {
  let amount;
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
    throw expressionError(node, "Repeat amounts must be positive.");
  }
  if (amount.denominator !== 1) {
    throw expressionError(
      node,
      "Repeat amounts must be positive whole numbers.",
    );
  }
  if (amount.numerator > MAX_VALUE_SEQUENCE_CHILDREN) {
    throw expressionError(
      node,
      `Repeat amounts cannot exceed ${MAX_VALUE_SEQUENCE_CHILDREN}.`,
    );
  }
  return amount.numerator;
}

function cycle(
  bars: readonly (readonly number[])[],
  values = countValues(bars),
) {
  assertBarCount(bars.length);
  assertValueCount(values);
  return {
    bars: Object.freeze(bars.map((bar) => Object.freeze(bar))),
    values,
  } satisfies ValueCycle;
}

function countValues(bars: readonly (readonly number[])[]) {
  return bars.reduce((total, bar) => total + bar.length, 0);
}

function assertBarCount(
  count: number,
  source?: { readonly range?: PatternRange },
) {
  if (count > MAX_VALUE_CYCLE_BARS) {
    throw expressionError(
      source ?? {},
      `Numeric pattern contains more than ${MAX_VALUE_CYCLE_BARS} bars.`,
    );
  }
}

function assertValueCount(
  count: number,
  source?: { readonly range?: PatternRange },
) {
  if (count > MAX_VALUE_CYCLE_VALUES) {
    throw expressionError(
      source ?? {},
      `Numeric pattern contains more than ${MAX_VALUE_CYCLE_VALUES} values.`,
    );
  }
}

function leastCommonMultiple(
  left: number,
  right: number,
  limit: number,
  source: { readonly range?: PatternRange },
) {
  const divisor = greatestCommonDivisor(left, right);
  if (left / divisor > Math.floor(limit / right)) {
    throw expressionError(source, `Numeric pattern exceeds ${limit} bars.`);
  }
  return (left / divisor) * right;
}

function greatestCommonDivisor(left: number, right: number) {
  while (right !== 0) [left, right] = [right, left % right];
  return left;
}

function expressionError(
  source: { readonly range?: PatternRange },
  message: string,
) {
  const location = source.range
    ? ` at source range [${source.range.start}, ${source.range.end})`
    : "";
  return new Error(`[Pattern] ${message}${location}`);
}

export { evaluateValuePatternExpression };
export type { NumericBars, ValueAtomInterpreter };
