import { describe, expect, it } from "vitest";
import {
  MAX_SHORTHAND_SOURCE_LENGTH,
  MAX_SHORTHAND_TOKENS,
} from "../../limits";
import { lexShorthand } from "../lexer";

describe("lexShorthand", () => {
  it("retains atom lexemes and half-open UTF-16 ranges", () => {
    expect(lexShorthand("😀 60 [64,67] ~!2")).toEqual([
      { type: "atom", value: "😀", range: { start: 0, end: 2 } },
      { type: "atom", value: "60", range: { start: 3, end: 5 } },
      { type: "delimiter", delimiter: "[", range: { start: 6, end: 7 } },
      { type: "atom", value: "64", range: { start: 7, end: 9 } },
      { type: "delimiter", delimiter: ",", range: { start: 9, end: 10 } },
      { type: "atom", value: "67", range: { start: 10, end: 12 } },
      { type: "delimiter", delimiter: "]", range: { start: 12, end: 13 } },
      { type: "rest", range: { start: 14, end: 15 } },
      { type: "operator", operator: "repeat", range: { start: 15, end: 16 } },
      { type: "atom", value: "2", range: { start: 16, end: 17 } },
    ]);
  });

  it("recognizes every generic postfix operator without interpreting its amount", () => {
    expect(lexShorthand("-2!02 *1.5 /3 @4")).toEqual([
      { type: "atom", value: "-2", range: { start: 0, end: 2 } },
      { type: "operator", operator: "repeat", range: { start: 2, end: 3 } },
      { type: "atom", value: "02", range: { start: 3, end: 5 } },
      { type: "operator", operator: "accelerate", range: { start: 6, end: 7 } },
      { type: "atom", value: "1.5", range: { start: 7, end: 10 } },
      { type: "operator", operator: "slow", range: { start: 11, end: 12 } },
      { type: "atom", value: "3", range: { start: 12, end: 13 } },
      { type: "operator", operator: "weight", range: { start: 14, end: 15 } },
      { type: "atom", value: "4", range: { start: 15, end: 16 } },
    ]);
  });

  it("treats tabs, newlines, and spaces uniformly", () => {
    expect(
      lexShorthand("0\t1\n2 3").map((token) =>
        token.type === "atom" ? [token.type, token.value] : [token.type],
      ),
    ).toEqual([
      ["atom", "0"],
      ["atom", "1"],
      ["atom", "2"],
      ["atom", "3"],
    ]);
  });

  it.each(["?", "|", "(", ")", ":"])(
    "rejects reserved character %s with its source range",
    (character) => {
      expect(() => lexShorthand(`0${character}1`)).toThrow(
        `Reserved character '${character}' is not supported at source range [1, 2).`,
      );
    },
  );

  it("rejects source strings beyond the bounded input size", () => {
    const source = "0".repeat(MAX_SHORTHAND_SOURCE_LENGTH + 1);
    expect(() => lexShorthand(source)).toThrow(
      `maximum length of ${MAX_SHORTHAND_SOURCE_LENGTH} UTF-16 code units`,
    );
  });

  it("rejects token streams beyond the bounded input size", () => {
    const source = Array.from(
      { length: MAX_SHORTHAND_TOKENS + 1 },
      () => "0",
    ).join(" ");
    expect(() => lexShorthand(source)).toThrow(
      `more than ${MAX_SHORTHAND_TOKENS} tokens`,
    );
  });
});
