import { describe, expect, it } from "vitest";
import { xox } from "./xox";

describe("xox", () => {
  it("parses x/o string notation", () => {
    expect(xox("xox.")).toEqual([[1, 0, 1, 0]]);
  });

  it("ignores whitespace in strings", () => {
    expect(xox("x o x")).toEqual([[1, 0, 1]]);
  });

  it("converts truthy/falsy numeric arrays", () => {
    expect(xox([1, 0, 1, 0])).toEqual([[1, 0, 1, 0]]);
  });

  it("converts a single truthy number to [1]", () => {
    expect(xox(5)).toEqual([[1]]);
  });

  it("converts a single falsy number to [0]", () => {
    expect(xox(0)).toEqual([[0]]);
  });

  it("handles multiple inputs as separate rows", () => {
    expect(xox("xo", "ox")).toEqual([
      [1, 0],
      [0, 1],
    ]);
  });

  it("returns empty inner array for empty string", () => {
    expect(xox("")).toEqual([[]]);
  });
});
