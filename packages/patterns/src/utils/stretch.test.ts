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

  it("rejects invalid bar and step counts", () => {
    const invalidCounts = [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY];

    for (const count of invalidCounts) {
      expect(() => stretch([[1, 2]], count)).toThrow(
        "stretch() bars must be a positive finite integer",
      );
      expect(() => stretch([[1, 2]], 1, count)).toThrow(
        "stretch() steps must be a positive finite integer",
      );
    }
  });

  it("uses the shared transform expansion guard", () => {
    expect(() => stretch([[1]], 1_025)).toThrow("more than 1024 bars");
  });

  it("returns an empty array for an empty cycle", () => {
    expect(stretch([], 3)).toEqual([]);
  });

  it("handles multiple patterns in the cycle", () => {
    expect(stretch([[1], [2]], 2)).toEqual([[1], [1], [2], [2]]);
  });
});
