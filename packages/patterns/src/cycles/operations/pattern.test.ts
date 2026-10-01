import { describe, expect, it } from "vitest";
import { pattern } from "./pattern";

describe("pattern", () => {
  it("wraps a single item in a nested array", () => {
    expect(pattern(1)).toEqual([[1]]);
  });

  it("wraps an array input in an outer array", () => {
    expect(pattern([1, 2, 3])).toEqual([[1, 2, 3]]);
  });

  it("handles multiple inputs mixing singles and arrays", () => {
    expect(pattern(1, [2, 3], 4)).toEqual([[1], [2, 3], [4]]);
  });

  it("returns an empty array when called with no arguments", () => {
    expect(pattern()).toEqual([]);
  });

  it("works with non-numeric types", () => {
    expect(pattern("a", ["b", "c"])).toEqual([["a"], ["b", "c"]]);
  });
});
