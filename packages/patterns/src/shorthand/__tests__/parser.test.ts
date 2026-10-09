import { describe, expect, expectTypeOf, it } from "vitest";
import { MAX_EXPRESSION_DEPTH } from "../../limits";
import type { PatternExpression, PatternNode } from "../../expressions/model";
import { ShorthandSyntaxError } from "../errors";
import { parseShorthand } from "../parser";

function atom(value: string, start: number, end: number) {
  return { type: "atom", value, range: { start, end } } as const;
}

function rest(start: number, end: number) {
  return { type: "rest", range: { start, end } } as const;
}

describe("parseShorthand", () => {
  it("parses a root atom and preserves the complete source range", () => {
    const expression = parseShorthand("60");
    expectTypeOf(expression).toEqualTypeOf<PatternExpression<string>>();
    expect(expression).toEqual({
      type: "pattern-expression",
      patterns: [atom("60", 0, 2)],
      range: { start: 0, end: 2 },
    });
  });

  it("parses whitespace-separated nodes as one ranged sequence", () => {
    expect(parseShorthand("60 64")).toEqual({
      type: "pattern-expression",
      patterns: [
        {
          type: "sequence",
          children: [atom("60", 0, 2), atom("64", 3, 5)],
          range: { start: 0, end: 5 },
        },
      ],
      range: { start: 0, end: 5 },
    });
  });

  it("parses square sequences and simultaneous voices distinctly", () => {
    expect(parseShorthand("[0 1]")).toEqual({
      type: "pattern-expression",
      patterns: [
        {
          type: "group",
          child: {
            type: "sequence",
            children: [atom("0", 1, 2), atom("1", 3, 4)],
            range: { start: 1, end: 4 },
          },
          range: { start: 0, end: 5 },
        },
      ],
      range: { start: 0, end: 5 },
    });
    expect(parseShorthand("[0,1]").patterns[0]).toEqual({
      type: "group",
      child: {
        type: "parallel",
        children: [atom("0", 1, 2), atom("1", 3, 4)],
        range: { start: 1, end: 4 },
      },
      range: { start: 0, end: 5 },
    });
  });

  it("parses alternation, rests, and postfix chains as model nodes", () => {
    expect(parseShorthand("<~ 0>!2/3")).toEqual({
      type: "pattern-expression",
      patterns: [
        {
          type: "modifier",
          operator: "slow",
          amount: "3",
          child: {
            type: "modifier",
            operator: "repeat",
            amount: "2",
            child: {
              type: "alternate",
              children: [rest(1, 2), atom("0", 3, 4)],
              range: { start: 0, end: 5 },
            },
            range: { start: 0, end: 7 },
          },
          range: { start: 0, end: 9 },
        },
      ],
      range: { start: 0, end: 9 },
    });
  });

  it("supports nested groups and duplicate voices without flattening them", () => {
    const node = parseShorthand("[0 [1,1]]").patterns[0];
    expect(node).toMatchObject({
      type: "group",
      child: {
        type: "sequence",
        children: [
          atom("0", 1, 2),
          {
            type: "group",
            child: {
              type: "parallel",
              children: [atom("1", 4, 5), atom("1", 6, 7)],
            },
            range: { start: 3, end: 8 },
          },
        ],
      },
    });
  });

  it("reports source-aware syntax errors as a dedicated error type", () => {
    try {
      parseShorthand("0 ? 1");
      expect.fail("Expected a syntax error");
    } catch (error) {
      expect(error).toBeInstanceOf(ShorthandSyntaxError);
      expect(error).toMatchObject({
        name: "ShorthandSyntaxError",
        source: "0 ? 1",
        range: { start: 2, end: 3 },
      });
      expect(error).toHaveProperty(
        "message",
        "[Pattern] Reserved character '?' is not supported at source range [2, 3).",
      );
    }
  });

  it.each(["", "   ", "[]", "<>"])(
    "rejects empty expression or structure %j",
    (source) => {
      expect(() => parseShorthand(source)).toThrow(
        /cannot be empty|cannot be empty; use '~'/,
      );
    },
  );

  it.each(["[0,,2]", "[0,]", "[,0]", "[0 1,2]", "[0,1 2]"])(
    "rejects malformed square group %s",
    (source) => {
      expect(() => parseShorthand(source)).toThrow();
    },
  );

  it("rejects rests as simultaneous voices", () => {
    expect(() => parseShorthand("[0,~]")).toThrow(
      "Rests cannot be simultaneous voices",
    );
    expect(() => parseShorthand("[[~],0]")).toThrow(
      "Rests cannot be simultaneous voices",
    );
  });

  it.each(["0,1", "<0,1>"])(
    "rejects comma outside voice groups: %s",
    (source) => {
      expect(() => parseShorthand(source)).toThrow();
    },
  );

  it.each(["!2", "0!", "0! 2", "0 !2", "0?2"])(
    "rejects malformed postfix syntax %s",
    (source) => {
      expect(() => parseShorthand(source)).toThrow();
    },
  );

  it("requires whitespace between sequential nodes but not around punctuation", () => {
    expect(() => parseShorthand("01")).not.toThrow();
    expect(() => parseShorthand("0~")).toThrow(
      "Whitespace is required between sequential nodes",
    );
    expect(() => parseShorthand("0[1]")).toThrow(
      "Whitespace is required between sequential nodes",
    );
    expect(parseShorthand("[0,1]")).toBeTruthy();
  });

  it("rejects unmatched and misplaced delimiters", () => {
    expect(() => parseShorthand("[0 1")).toThrow("Expected ']' ");
    expect(() => parseShorthand("<0 1")).toThrow("Expected '>' ");
    expect(() => parseShorthand("0]")).toThrow("Unexpected token ']' ");
  });

  it("bounds nested source structure before recursive parsing can overflow", () => {
    const source =
      "[".repeat(MAX_EXPRESSION_DEPTH + 1) +
      "0" +
      "]".repeat(MAX_EXPRESSION_DEPTH + 1);
    expect(() => parseShorthand(source)).toThrow(
      `maximum depth of ${MAX_EXPRESSION_DEPTH}`,
    );
  });

  it("returns ordinary inspectable expression data", () => {
    const expression = parseShorthand("0 <1 2>");
    expect(Object.getPrototypeOf(expression)).toBe(Object.prototype);
    expect(Object.keys(expression)).toEqual(["type", "patterns", "range"]);
    expect(JSON.parse(JSON.stringify(expression))).toEqual(expression);
  });

  it("keeps every parsed node assignable to the shared model", () => {
    const expression = parseShorthand("[0,1] ~");
    for (const node of expression.patterns) {
      expectTypeOf(node).toExtend<PatternNode<string>>();
    }
  });
});
