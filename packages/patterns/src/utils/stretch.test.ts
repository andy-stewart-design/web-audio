import { describe, expect, it } from "vitest";
import { stretch } from "./stretch";

describe("stretch", () => {
  it("repeats each pattern when bars > 1", () => {
    expect(stretch([[1, 2]], 3)).toEqual([
      [1, 2],
      [1, 2],
      [1, 2],
    ]);
  });

  it("duplicates each element when steps > 1", () => {
    expect(stretch([[1, 2, 3]], 1, 2)).toEqual([[1, 1, 2, 2, 3, 3]]);
  });

  it("applies both bars and steps together", () => {
    expect(stretch([[1, 2]], 2, 2)).toEqual([
      [1, 1, 2, 2],
      [1, 1, 2, 2],
    ]);
  });

  it("clamps bars to 1 when bars < 1", () => {
    expect(stretch([[1, 2]], 0)).toEqual([[1, 2]]);
    expect(stretch([[1, 2]], -5)).toEqual([[1, 2]]);
  });

  it("rounds fractional values", () => {
    expect(stretch([[1, 2]], 2.7)).toEqual([
      [1, 2],
      [1, 2],
      [1, 2],
    ]);
  });

  it("returns an empty array for an empty cycle", () => {
    expect(stretch([], 3)).toEqual([]);
  });

  it("handles multiple patterns in the cycle", () => {
    expect(stretch([[1], [2]], 2)).toEqual([[1], [1], [2], [2]]);
  });
});
