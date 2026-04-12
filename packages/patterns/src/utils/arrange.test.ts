import { describe, expect, it } from "vitest";
import { arrange } from "./arrange";

describe("arrange", () => {
  it("repeats a single pattern the specified number of times", () => {
    expect(arrange([3, [1, 2]])).toEqual([[1, 2], [1, 2], [1, 2]]);
  });

  it("wraps a single value in an array", () => {
    expect(arrange([2, 5])).toEqual([[5], [5]]);
  });

  it("handles multiple pairs with different counts", () => {
    expect(arrange([2, [1]], [1, [2]])).toEqual([[1], [1], [2]]);
  });

  it("skips patterns with count 0", () => {
    expect(arrange([0, [1, 2]], [2, [3]])).toEqual([[3], [3]]);
  });

  it("returns an empty array when called with no arguments", () => {
    expect(arrange()).toEqual([]);
  });
});
