import { describe, expect, it, vi } from "vitest";
import { parseShorthand } from "../../shorthand/parser";
import {
  MAX_VALUE_ALTERNATION_CHOICES,
  MAX_VALUE_CYCLE_BARS,
  MAX_VALUE_CYCLE_VALUES,
  MAX_VALUE_SEQUENCE_CHILDREN,
} from "../../limits";
import { evaluateValuePatternExpression } from "../evaluate-value";
import type { PatternExpression, PatternNode } from "../model";

function evaluate(source: string) {
  return evaluateValuePatternExpression(parseShorthand(source), Number);
}

function expression<T>(...patterns: PatternNode<T>[]) {
  return {
    type: "pattern-expression",
    patterns,
  } as const satisfies PatternExpression<T>;
}

function atom<T>(value: T): PatternNode<T> {
  return { type: "atom", value };
}

describe("evaluateValuePatternExpression", () => {
  it("evaluates numeric sequence, grouping, and structural repetition", () => {
    expect(evaluate("0.2 0.8")).toEqual([[0.2, 0.8]]);
    expect(evaluate("0.2 [0.4 0.6] 0.8")).toEqual([[0.2, 0.4, 0.6, 0.8]]);
    expect(evaluate("[0.2]")).toEqual([[0.2]]);
    expect(evaluate("0.2!3 0.8")).toEqual([[0.2, 0.2, 0.2, 0.8]]);
    expect(evaluate("[0.2 0.8]!2")).toEqual([[0.2, 0.8, 0.2, 0.8]]);
    expect(evaluate("1!2!3")).toEqual([[1, 1, 1, 1, 1, 1]]);
  });

  it("evaluates alternation with local progression and bounded LCM composition", () => {
    expect(evaluate("<0.2 0.8>")).toEqual([[0.2], [0.8]]);
    expect(evaluate("<[0.2 0.8] [0.4 1]>")).toEqual([
      [0.2, 0.8],
      [0.4, 1],
    ]);
    expect(evaluate("0.2 <0.5 0.8>")).toEqual([
      [0.2, 0.5],
      [0.2, 0.8],
    ]);
    expect(evaluate("<0 <2 3>>")).toEqual([[0], [2], [0], [3]]);
    expect(evaluate("<0 1> <2 3 4>")).toEqual([
      [0, 2],
      [1, 3],
      [0, 4],
      [1, 2],
      [0, 3],
      [1, 4],
    ]);
    expect(evaluate("<1 2>!2")).toEqual([
      [1, 1],
      [2, 2],
    ]);
    expect(evaluate("[<1 2>]!2")).toEqual([
      [1, 1],
      [2, 2],
    ]);
    expect(evaluate("<1!3 2>")).toEqual([[1], [1], [1], [2]]);
    expect(evaluate("<[1!3] 2>")).toEqual([[1, 1, 1], [2]]);
  });

  it("reduces repeated nested alternate periods by gcd across explicit bars", () => {
    const atomNode = (value: string) => atom(value);
    const nested = {
      type: "alternate",
      children: [atomNode("1"), atomNode("2")],
    } as const;
    const secondNested = {
      type: "alternate",
      children: [atomNode("3"), atomNode("4"), atomNode("5")],
    } as const;
    const repeatedChoices = {
      type: "alternate",
      children: [
        {
          type: "modifier",
          operator: "repeat",
          amount: "2",
          child: nested,
        },
        {
          type: "modifier",
          operator: "repeat",
          amount: "2",
          child: secondNested,
        },
        atomNode("9"),
      ],
    } as const;

    expect(
      evaluateValuePatternExpression(
        expression(repeatedChoices, atomNode("8")),
        Number,
      ),
    ).toEqual([
      [1],
      [2],
      [3],
      [4],
      [9],
      [1],
      [2],
      [5],
      [3],
      [9],
      [1],
      [2],
      [4],
      [5],
      [9],
      [8],
    ]);
  });

  it("passes atom ranges to the caller and rejects non-finite values", () => {
    const range = { start: 2, end: 3 };
    const expressionWithRange = expression({
      type: "atom",
      value: "1",
      range,
    });
    const ranges: unknown[] = [];
    const interpret = (value: string, receivedRange?: unknown) => {
      ranges.push(receivedRange);
      return Number(value);
    };
    expect(
      evaluateValuePatternExpression(expressionWithRange, interpret),
    ).toEqual([[1]]);
    expect(ranges).toEqual([range]);

    for (const value of ["Infinity", "-Infinity", "NaN"]) {
      expect(() =>
        evaluateValuePatternExpression(expression(atom(value)), Number),
      ).toThrow("finite");
    }
  });

  it("propagates atom callback exceptions with their source range", () => {
    const range = { start: 4, end: 9 };
    const failure = new Error("atom callback failed");
    const interpret = (_value: string, receivedRange?: typeof range) => {
      expect(receivedRange).toEqual(range);
      throw failure;
    };

    expect(() =>
      evaluateValuePatternExpression(
        expression({ type: "atom", value: "value", range }),
        interpret,
      ),
    ).toThrow(failure);
  });

  it("treats a pure callback equivalently across repeated, grouped, and sequence placement", () => {
    const interpret = (value: string) => Number(value);
    const results = ["1!3", "[1]!3", "1 1 1"].map((source) =>
      evaluateValuePatternExpression(parseShorthand(source), interpret),
    );

    expect(results[0]).toEqual(results[1]);
    expect(results[1]).toEqual(results[2]);
  });

  it("validates every alternate branch and rejects unsupported numeric constructs", () => {
    for (const source of [
      "0.2 ~ 0.8",
      "[0.2,0.8]",
      "0.2*2",
      "0.2/2",
      "0.2@3",
      "<0.2 [0.8 ~]>",
    ]) {
      expect(() => evaluate(source), source).toThrow();
    }

    expect(() =>
      evaluateValuePatternExpression(
        expression({ type: "parallel", children: [atom(1)] }),
        Number,
      ),
    ).toThrow("Parallel");
    expect(() =>
      evaluateValuePatternExpression(expression({ type: "rest" }), Number),
    ).toThrow("Rests");
    expect(() =>
      evaluateValuePatternExpression(
        expression({ type: "sequence", children: [] }),
        Number,
      ),
    ).toThrow("Sequences cannot be empty");
    expect(() =>
      evaluateValuePatternExpression(
        expression({ type: "alternate", children: [] }),
        Number,
      ),
    ).toThrow("Alternations cannot be empty");
  });

  it("uses positive whole repeat amounts", () => {
    for (const source of ["1!0", "1!-1", "1!1.5"]) {
      expect(() => evaluate(source), source).toThrow(
        /positive|whole|repeat|decimal/i,
      );
    }
  });

  it("accepts and rejects the choice-schedule boundaries before atom interpretation", () => {
    expect(evaluate("<1!1024>")).toHaveLength(MAX_VALUE_ALTERNATION_CHOICES);
    const interpret = vi.fn((value: string) => Number(value));
    expect(() =>
      evaluateValuePatternExpression(parseShorthand("<1!1025>"), interpret),
    ).toThrow("choices");
    expect(interpret).not.toHaveBeenCalled();
  });

  it("applies the normative child-cycle round boundary", () => {
    const accepted = evaluate("<<1 2> 3!511>");
    expect(accepted).toHaveLength(MAX_VALUE_CYCLE_BARS);
    expect(accepted[0]).toEqual([1]);
    expect(accepted[1]).toEqual([3]);
    expect(accepted[511]).toEqual([3]);
    expect(accepted[512]).toEqual([2]);
    expect(() => evaluate("<<1 2> 3!512>")).toThrow();
  });

  it("enforces the exact expanded sequence-child boundary", () => {
    const accepted = evaluate(`1!${MAX_VALUE_SEQUENCE_CHILDREN - 1} 2`);
    expect(accepted).toHaveLength(1);
    expect(accepted[0]).toHaveLength(MAX_VALUE_SEQUENCE_CHILDREN);
    expect(() => evaluate(`1!${MAX_VALUE_SEQUENCE_CHILDREN} 2`)).toThrow(
      "Sequence expands",
    );
  });

  it("counts logical values per intermediate and output cycle", () => {
    const accepted = evaluate("[1!16384]");
    expect(accepted).toHaveLength(1);
    expect(accepted[0]).toHaveLength(MAX_VALUE_CYCLE_VALUES);
    expect(() => evaluate("[1!16384]!2")).toThrow("values");
    expect(() => evaluate("[1!16384] 2")).toThrow("values");
  });

  it("counts sequence and alternate wrapping per result, not across evaluations", () => {
    const sequence = evaluate("1!8191 <2 3>");
    expect(sequence.map((bar) => bar.length)).toEqual([8192, 8192]);

    const alternate = evaluate("<[1!8191] <2 3>>");
    expect(alternate.map((bar) => bar.length)).toEqual([8191, 1, 8191, 1]);

    expect(() => evaluate("1!8192 <2 3>")).toThrow("values");
    expect(() => evaluate("<[1!8192] <2 3>>")).toThrow("values");

    expect(evaluate("1!16384")[0]).toHaveLength(MAX_VALUE_CYCLE_VALUES);
    expect(evaluate("2!16384")[0]).toHaveLength(MAX_VALUE_CYCLE_VALUES);
  });

  it("rejects oversized intermediates even when an outer alternate selects fewer bars", () => {
    expect(() => evaluate("<[1!8192 <2 3>] 4>")).toThrow("values");
  });

  it("stops a repeated sequence child after the parent lower bound is exceeded", () => {
    const largeChild = {
      type: "group",
      child: {
        type: "modifier",
        operator: "repeat",
        amount: String(MAX_VALUE_CYCLE_VALUES),
        child: atom(1),
      },
    } as const;
    const stress = {
      type: "sequence",
      children: [
        {
          type: "modifier",
          operator: "repeat",
          amount: String(MAX_VALUE_SEQUENCE_CHILDREN),
          child: largeChild,
        },
      ],
    } as const;

    expect(() =>
      evaluateValuePatternExpression(expression(stress), Number),
    ).toThrow("values");
  });

  it("does not mutate or retain progression state in the expression", () => {
    const input = parseShorthand("<1 2> [3 4]");
    const snapshot = structuredClone(input);
    const first = evaluateValuePatternExpression(input, Number);
    const second = evaluateValuePatternExpression(input, Number);
    expect(first).toEqual(second);
    expect(input).toEqual(snapshot);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first[0])).toBe(true);
  });

  it("rejects an output cycle over the bar budget", () => {
    const patterns = Array.from({ length: MAX_VALUE_CYCLE_BARS + 1 }, () =>
      atom(1),
    );
    expect(() =>
      evaluateValuePatternExpression(expression(...patterns), Number),
    ).toThrow("patterns");
  });
});
