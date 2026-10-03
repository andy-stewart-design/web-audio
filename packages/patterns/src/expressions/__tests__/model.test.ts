import { describe, expect, expectTypeOf, it } from "vitest";
import {
  assertPatternExpressionLimits,
  type PatternAlternate,
  type PatternAtom,
  type PatternExpression,
  type PatternGroup,
  type PatternModifier,
  type PatternNode,
  type PatternParallel,
  type PatternRange,
  type PatternRest,
  type PatternSequence,
} from "../model";
import { MAX_EXPRESSION_DEPTH, MAX_EXPRESSION_NODES } from "../../limits";

function createExpression<T>(patterns: readonly PatternNode<T>[]) {
  return {
    type: "pattern-expression",
    patterns,
  } as const satisfies PatternExpression<T>;
}

function createNodeVariants() {
  const atom: PatternAtom<number> = { type: "atom", value: 60 };
  const rest: PatternRest = { type: "rest" };
  const nodes: readonly PatternNode<number>[] = [
    atom,
    rest,
    { type: "sequence", children: [atom, rest] },
    { type: "group", child: atom },
    { type: "parallel", children: [atom, atom] },
    { type: "alternate", children: [atom, rest] },
    { type: "modifier", operator: "repeat", amount: "2", child: atom },
  ];
  return nodes;
}

function createNestedNode(
  depth: number,
  type: Exclude<PatternNode<number>["type"], "atom" | "rest">,
) {
  let node: PatternNode<number> = { type: "atom", value: 60 };
  for (let level = 1; level < depth; level++) {
    if (type === "group") {
      node = { type, child: node };
    } else if (type === "modifier") {
      node = { type, operator: "slow", amount: "2", child: node };
    } else {
      node = { type, children: [node] };
    }
  }
  return node;
}

function createFrozenExpression() {
  const range = Object.freeze({ start: 0, end: 3 });
  const atom = Object.freeze({ type: "atom", value: "060", range } as const);
  const rest = Object.freeze({ type: "rest", range } as const);
  const sequence = Object.freeze({
    type: "sequence",
    children: Object.freeze([atom, rest]),
    range,
  } as const);
  const group = Object.freeze({
    type: "group",
    child: sequence,
    range,
  } as const);
  const parallel = Object.freeze({
    type: "parallel",
    children: Object.freeze([atom, atom]),
    range,
  } as const);
  const alternate = Object.freeze({
    type: "alternate",
    children: Object.freeze([atom, group]),
    range,
  } as const);
  const modifier = Object.freeze({
    type: "modifier",
    operator: "accelerate",
    amount: "02.00",
    child: parallel,
    range,
  } as const);
  return Object.freeze({
    type: "pattern-expression",
    patterns: Object.freeze([
      atom,
      rest,
      sequence,
      group,
      parallel,
      alternate,
      modifier,
    ]),
    range,
  } as const satisfies PatternExpression<string>);
}

describe("PatternExpression", () => {
  it("defines and narrows every node variant", () => {
    const expression: PatternExpression<number> =
      createExpression(createNodeVariants());
    expectTypeOf(expression).toEqualTypeOf<PatternExpression<number>>();
    expect(expression.patterns.map((node) => node.type)).toEqual([
      "atom",
      "rest",
      "sequence",
      "group",
      "parallel",
      "alternate",
      "modifier",
    ]);

    for (const node of expression.patterns) {
      switch (node.type) {
        case "atom":
          expectTypeOf(node).toEqualTypeOf<PatternAtom<number>>();
          expectTypeOf(node.value).toEqualTypeOf<number>();
          break;
        case "rest":
          expectTypeOf(node).toEqualTypeOf<PatternRest>();
          break;
        case "sequence":
          expectTypeOf(node).toEqualTypeOf<PatternSequence<number>>();
          break;
        case "group":
          expectTypeOf(node).toEqualTypeOf<PatternGroup<number>>();
          break;
        case "parallel":
          expectTypeOf(node).toEqualTypeOf<PatternParallel<number>>();
          break;
        case "alternate":
          expectTypeOf(node).toEqualTypeOf<PatternAlternate<number>>();
          break;
        case "modifier":
          expectTypeOf(node).toEqualTypeOf<PatternModifier<number>>();
          break;
      }
    }
    expect(assertPatternExpressionLimits(expression)).toBeUndefined();
  });

  it("makes node fields, ranges, and structural arrays readonly", () => {
    // This function is type-checked by pnpm check, but never executed.
    const attemptMutation = (
      expression: PatternExpression<number>,
      atom: PatternAtom<number>,
      rest: PatternRest,
      sequence: PatternSequence<number>,
      group: PatternGroup<number>,
      parallel: PatternParallel<number>,
      alternate: PatternAlternate<number>,
      modifier: PatternModifier<number>,
      range: PatternRange,
    ) => {
      // @ts-expect-error The root discriminant is readonly.
      expression.type = "pattern-expression";
      // @ts-expect-error Root patterns cannot be replaced.
      expression.patterns = [];
      // @ts-expect-error Root patterns cannot be appended.
      expression.patterns.push(rest);
      // @ts-expect-error Source ranges cannot be replaced.
      expression.range = range;
      // @ts-expect-error Atom values cannot be replaced.
      atom.value = 64;
      // @ts-expect-error Rest nodes are readonly too.
      rest.type = "rest";
      // @ts-expect-error Sequence children cannot be replaced.
      sequence.children = [];
      // @ts-expect-error Sequence children cannot be appended.
      sequence.children.push(atom);
      // @ts-expect-error Group children cannot be replaced.
      group.child = rest;
      // @ts-expect-error Parallel children cannot be reordered.
      parallel.children.reverse();
      // @ts-expect-error Alternate children cannot be replaced.
      alternate.children = [];
      // @ts-expect-error Modifier operands cannot be replaced.
      modifier.child = rest;
      // @ts-expect-error Modifier operators cannot be replaced.
      modifier.operator = "slow";
      // @ts-expect-error Modifier amount lexemes cannot be replaced.
      modifier.amount = "3";
      // @ts-expect-error Range starts are readonly.
      range.start = 1;
      // @ts-expect-error Range ends are readonly.
      range.end = 2;
    };
    expectTypeOf(attemptMutation).toBeFunction();
  });

  it("represents multiple structured bars without text ranges", () => {
    const expression = createExpression([
      { type: "sequence", children: createNodeVariants() },
      { type: "rest" },
      { type: "atom", value: 67 },
    ]);
    expect(expression.patterns).toHaveLength(3);
    expect(Object.keys(expression)).toEqual(["type", "patterns"]);
    expect(assertPatternExpressionLimits(expression)).toBeUndefined();
  });

  it("keeps generic atom payloads opaque", () => {
    const payload = {
      type: "sequence",
      children: Array.from({ length: MAX_EXPRESSION_NODES + 1 }, () => ({
        type: "rest",
      })),
    };
    const atom: PatternAtom<typeof payload> = { type: "atom", value: payload };
    expectTypeOf(atom.value).toEqualTypeOf<typeof payload>();
    expect(atom.value).toBe(payload);
    expect(
      assertPatternExpressionLimits(createExpression([atom])),
    ).toBeUndefined();
  });

  it.each(["repeat", "accelerate", "slow", "weight"] as const)(
    "preserves the %s modifier amount as an uninterpreted lexeme",
    (operator) => {
      const modifier: PatternModifier<string> = {
        type: "modifier",
        operator,
        amount: "02.00",
        child: { type: "atom", value: "060" },
      };
      expectTypeOf(modifier.amount).toEqualTypeOf<string>();
      expect(modifier.amount).toBe("02.00");
      expect(
        assertPatternExpressionLimits(createExpression([modifier])),
      ).toBeUndefined();
    },
  );

  it("supports frozen, enumerable, inspectable ordinary data without mutation", () => {
    const expression = createFrozenExpression();
    const serialized = JSON.stringify(expression);
    expect(Object.getPrototypeOf(expression)).toBe(Object.prototype);
    expect(Object.keys(expression)).toEqual(["type", "patterns", "range"]);
    expect(Object.isFrozen(expression)).toBe(true);
    expect(Object.isFrozen(expression.patterns)).toBe(true);
    expect(Object.isFrozen(expression.range)).toBe(true);

    for (const node of expression.patterns) {
      expect(Object.getPrototypeOf(node)).toBe(Object.prototype);
      expect(Object.isFrozen(node)).toBe(true);
      expect(Object.isFrozen(node.range)).toBe(true);
      expect(
        Object.values(Object.getOwnPropertyDescriptors(node)).every(
          (descriptor) => descriptor.enumerable,
        ),
      ).toBe(true);
      if ("children" in node) expect(Object.isFrozen(node.children)).toBe(true);
    }

    expect(Reflect.set(expression, "type", "other")).toBe(false);
    expect(Reflect.set(expression.patterns, "0", { type: "rest" })).toBe(false);
    expect(Reflect.set(expression.patterns[0], "value", "64")).toBe(false);
    expect(Reflect.set(expression.range, "start", 1)).toBe(false);
    expect(assertPatternExpressionLimits(expression)).toBeUndefined();
    expect(JSON.stringify(expression)).toBe(serialized);
    expect(JSON.parse(serialized)).toEqual(expression);
  });
});

describe("assertPatternExpressionLimits", () => {
  it("accepts exactly the maximum node count, excluding the root wrapper", () => {
    const children = Array.from(
      { length: MAX_EXPRESSION_NODES - 1 },
      () =>
        ({
          type: "rest",
        }) as const,
    );
    const expression = createExpression([{ type: "sequence", children }]);
    expect(assertPatternExpressionLimits(expression)).toBeUndefined();
  });

  it.each(["sequence", "parallel", "alternate"] as const)(
    "counts the %s wrapper as well as its children",
    (type) => {
      const children = Array.from(
        { length: MAX_EXPRESSION_NODES },
        () =>
          ({
            type: "rest",
          }) as const,
      );
      expect(() =>
        assertPatternExpressionLimits(createExpression([{ type, children }])),
      ).toThrow(
        `[Pattern] Expression contains more than ${MAX_EXPRESSION_NODES} nodes.`,
      );
    },
  );

  it("counts every occurrence across root patterns, including shared nodes", () => {
    const atom: PatternAtom<number> = { type: "atom", value: 60 };
    const patterns = Array.from({ length: MAX_EXPRESSION_NODES }, () => atom);
    expect(
      assertPatternExpressionLimits(createExpression(patterns)),
    ).toBeUndefined();
    expect(() =>
      assertPatternExpressionLimits(createExpression([...patterns, atom])),
    ).toThrow(
      `[Pattern] Expression contains more than ${MAX_EXPRESSION_NODES} nodes.`,
    );
  });

  it.each(["sequence", "group", "parallel", "alternate", "modifier"] as const)(
    "enforces the exact depth boundary through %s nodes",
    (type) => {
      const accepted = createExpression([
        createNestedNode(MAX_EXPRESSION_DEPTH, type),
      ]);
      const rejected = createExpression([
        createNestedNode(MAX_EXPRESSION_DEPTH + 1, type),
      ]);
      expect(assertPatternExpressionLimits(accepted)).toBeUndefined();
      expect(() => assertPatternExpressionLimits(rejected)).toThrow(
        `[Pattern] Expression exceeds the maximum depth of ${MAX_EXPRESSION_DEPTH}.`,
      );
    },
  );

  it("rejects extremely deep trees without overflowing the call stack", () => {
    const expression = createExpression([createNestedNode(10_000, "group")]);
    expect(() => assertPatternExpressionLimits(expression)).toThrow(
      `[Pattern] Expression exceeds the maximum depth of ${MAX_EXPRESSION_DEPTH}.`,
    );
  });

  it("bounds cyclic input rather than looping indefinitely", () => {
    const children: PatternNode<number>[] = [];
    const node: PatternSequence<number> = { type: "sequence", children };
    children.push(node);
    expect(() =>
      assertPatternExpressionLimits(createExpression([node])),
    ).toThrow(
      `[Pattern] Expression exceeds the maximum depth of ${MAX_EXPRESSION_DEPTH}.`,
    );
  });
});
