import { describe, expect, it } from "vitest";
import { reverse } from "./reverse";

describe("reverse", () => {
  it("reverses the order of patterns and elements within each pattern", () => {
    expect(reverse([[1, 2], [3, 4]])).toEqual([[4, 3], [2, 1]]);
  });

  it("reverses elements in a single pattern", () => {
    expect(reverse([[1, 2, 3]])).toEqual([[3, 2, 1]]);
  });

  it("does not mutate the original cycle", () => {
    const original = [[1, 2], [3, 4]];
    reverse(original);
    expect(original).toEqual([[1, 2], [3, 4]]);
  });

  it("returns an empty array for an empty cycle", () => {
    expect(reverse([])).toEqual([]);
  });
});
