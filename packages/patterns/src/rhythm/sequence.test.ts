import { describe, expect, it } from "vitest";
import { sequence } from "./sequence";

describe("sequence", () => {
  it("creates a binary pattern with active steps", () => {
    expect(sequence(4, 0, 2)).toEqual([
      [1, 0, 0, 0],
      [0, 0, 1, 0],
    ]);
  });

  it("handles array steps to activate multiple positions in one row", () => {
    expect(sequence(4, [0, 2])).toEqual([[1, 0, 1, 0]]);
  });

  it("ignores out-of-range indices", () => {
    expect(sequence(3, 5)).toEqual([[0, 0, 0]]);
  });

  it("returns empty inner arrays when stepCount is 0", () => {
    expect(sequence(0, 1, 2)).toEqual([[], []]);
  });

  it("handles a single step input", () => {
    expect(sequence(4, 1)).toEqual([[0, 1, 0, 0]]);
  });
});
