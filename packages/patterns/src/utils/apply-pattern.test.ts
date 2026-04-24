import { describe, expect, it } from "vitest";
import { applyPattern } from "./apply-pattern";

describe("applyPattern", () => {
  it("fills active slots sequentially from note content", () => {
    expect(applyPattern([[10, 20, 30]], [[1, 0, 1, 0, 1, 0, 1, 0]], 0)).toEqual(
      [[10, 0, 20, 0, 30, 0, 10, 0]],
    );
  });

  it("places nullValue in inactive slots", () => {
    expect(applyPattern([[10, 20]], [[1, 0, 1]], 0)).toEqual([[10, 0, 20]]);
  });

  it("wraps note content when modifier has more bars than cycle", () => {
    expect(
      applyPattern(
        [[10, 20]],
        [
          [1, 0],
          [0, 1],
        ],
        0,
      ),
    ).toEqual([
      [10, 0],
      [0, 10],
    ]);
  });

  it("wraps modifier when cycle has more bars than modifier", () => {
    expect(
      applyPattern(
        [
          [10, 20],
          [30, 40],
        ],
        [[1, 0]],
        0,
      ),
    ).toEqual([
      [10, 0],
      [30, 0],
    ]);
  });

  it("resets noteIndex per bar, not globally", () => {
    // Two bars, each with one active pulse — both should pull from index 0 of their bar
    const result = applyPattern(
      [
        [10, 20],
        [30, 40],
      ],
      [
        [1, 0],
        [1, 0],
      ],
      0,
    );
    expect(result[0][0]).toBe(10);
    expect(result[1][0]).toBe(30);
  });

  it("handles an all-zero modifier", () => {
    expect(applyPattern([[10, 20]], [[0, 0, 0]], 0)).toEqual([[0, 0, 0]]);
  });

  it("handles an all-active modifier", () => {
    expect(applyPattern([[10, 20]], [[1, 1, 1, 1]], 0)).toEqual([
      [10, 20, 10, 20],
    ]);
  });

  it("works with non-numeric nullValue", () => {
    expect(applyPattern([["a", "b"]], [[1, 0, 1]], null)).toEqual([
      ["a", null, "b"],
    ]);
  });
});
