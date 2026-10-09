import { describe, expect, it } from "vitest";
import { MAX_EXPRESSION_NODES, parseShorthand } from "@web-audio/patterns";
import {
  decodeXoxShorthandExpression,
  evaluateXoxShorthand,
} from "@/inputs/decode-xox-input";
import {
  interpretNoteAtom,
  interpretSampleNameAtom,
  interpretVariationAtom,
  interpretXoxAtom,
} from "@/inputs/atom-interpreters";

const range = { start: 4, end: 7 };

function geometry(source: string) {
  return evaluateXoxShorthand(source).patterns.map((pattern) =>
    pattern.map((step) => step.type),
  );
}

describe("numeric shorthand atom interpreters", () => {
  it("preserve signed and fractional finite values", () => {
    expect(interpretNoteAtom("-2", range)).toEqual({
      type: "event",
      value: -2,
    });
    expect(interpretVariationAtom("1.5", range)).toEqual({
      type: "event",
      value: 1.5,
    });
    expect(interpretNoteAtom("+.5", range)).toEqual({
      type: "event",
      value: 0.5,
    });
  });

  it.each(["", "Infinity", "NaN", "1 2", "0x10", "1_000"])(
    "rejects non-strict numeric text %j with its target and range",
    (value) => {
      expect(() => interpretNoteAtom(value, range)).toThrow(
        `[Instrument] notes() atom '${value}' must be a finite numeric value at source range [4, 7).`,
      );
    },
  );
});

describe("sample-name shorthand atom interpreter", () => {
  it("accepts notation-safe aliases without changing their text", () => {
    expect(interpretSampleNameAtom("bd", range)).toEqual({
      type: "event",
      value: "bd",
    });
    expect(interpretSampleNameAtom("808", range)).toEqual({
      type: "event",
      value: "808",
    });
  });

  it.each(["bd-2", "bd_2", "bd:2", "bd.wav"])(
    "rejects invalid alias %j with its source range",
    (value) => {
      expect(() => interpretSampleNameAtom(value, range)).toThrow(
        `[Sampler] name() sample atoms must match [A-Za-z0-9]+ at source range [4, 7).`,
      );
    },
  );
});

describe("XOX shorthand decoding", () => {
  it("maps onset and rest atoms during evaluation", () => {
    expect(interpretXoxAtom("1", range)).toEqual({
      type: "event",
      value: 1,
    });
    expect(interpretXoxAtom("x", range)).toEqual({
      type: "event",
      value: 1,
    });
    expect(interpretXoxAtom("0", range)).toEqual({ type: "rest" });
    expect(interpretXoxAtom("o", range)).toEqual({ type: "rest" });
    expect(interpretXoxAtom(".", range)).toEqual({ type: "rest" });
    expect(() => interpretXoxAtom("2", range)).toThrow(
      "[Instrument] xox() atoms must be one of '1', 'x', '0', 'o', or '.' at source range [4, 7).",
    );
  });

  it("decodes compact legacy strings as one sequence bar", () => {
    expect(decodeXoxShorthandExpression("x o . x")).toEqual({
      type: "pattern-expression",
      patterns: [
        {
          type: "sequence",
          children: [
            { type: "atom", value: "x", range: { start: 0, end: 1 } },
            { type: "atom", value: "o", range: { start: 2, end: 3 } },
            { type: "atom", value: ".", range: { start: 4, end: 5 } },
            { type: "atom", value: "x", range: { start: 6, end: 7 } },
          ],
          range: { start: 0, end: 7 },
        },
      ],
      range: { start: 0, end: 7 },
    });
  });

  it("uses the general parser for non-compact shorthand", () => {
    expect(decodeXoxShorthandExpression("1!2 0")).toEqual(
      parseShorthand("1!2 0"),
    );
  });

  it("enforces the expression node limit before compact allocation grows", () => {
    const source = "x".repeat(MAX_EXPRESSION_NODES);
    expect(() => decodeXoxShorthandExpression(source)).toThrow(
      `[Instrument] xox() shorthand expression contains more than ${MAX_EXPRESSION_NODES} nodes at source range [${MAX_EXPRESSION_NODES - 1}, ${MAX_EXPRESSION_NODES}).`,
    );
  });

  it("produces the same cycle geometry for compact and general XOX", () => {
    expect(geometry("x x x x o o o o")).toEqual(geometry("1!4 0!4"));
    expect(geometry("x o . x")).toEqual([["event", "rest", "rest", "event"]]);
  });

  it("rejects XOX polyphony with a target-specific range", () => {
    expect(() => evaluateXoxShorthand("[1,0]")).toThrow(
      "[Instrument] xox() does not support simultaneous voice groups at source range [1, 4).",
    );
  });

  it("accepts a standalone shorthand rest", () => {
    expect(geometry("~")).toEqual([["rest"]]);
  });
});
