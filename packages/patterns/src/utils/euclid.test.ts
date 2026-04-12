import { describe, expect, it } from "vitest";
import { euclid } from "./euclid";

describe("euclid", () => {
  it("generates a known euclidean rhythm (3, 8)", () => {
    expect(euclid(3, 8)).toEqual([[1, 0, 0, 1, 0, 0, 1, 0]]);
  });

  it("generates evenly spaced rhythm (4, 16)", () => {
    expect(euclid(4, 16)).toEqual([
      [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    ]);
  });

  it("returns all ones when pulse equals steps", () => {
    expect(euclid(4, 4)).toEqual([[1, 1, 1, 1]]);
  });

  it("returns all zeros when pulse is 0", () => {
    expect(euclid(0, 4)).toEqual([[0, 0, 0, 0]]);
  });

  it("returns empty array when pulse > steps", () => {
    expect(euclid(5, 3)).toEqual([[]]);
  });

  it("returns empty array for negative values", () => {
    expect(euclid(-1, 4)).toEqual([[]]);
    expect(euclid(2, -1)).toEqual([[]]);
  });

  it("applies rotation", () => {
    const unrotated = euclid(3, 8)[0];
    const rotated = euclid(3, 8, 1)[0];
    expect(rotated).toEqual([...unrotated.slice(1), unrotated[0]]);
  });

  it("handles negative rotation", () => {
    const rotated = euclid(3, 8, -1)[0];
    const unrotated = euclid(3, 8)[0];
    expect(rotated).toEqual([
      ...unrotated.slice(unrotated.length - 1),
      ...unrotated.slice(0, unrotated.length - 1),
    ]);
  });

  it("generates multiple cycles from array inputs for pulses", () => {
    const result = euclid([3, 4], 8);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(euclid(3, 8)[0]);
    expect(result[1]).toEqual(euclid(4, 8)[0]);
  });

  it("generates multiple cycles from array inputs for rotation", () => {
    const result = euclid(3, 8, [0, 2]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(euclid(3, 8, 0)[0]);
    expect(result[1]).toEqual(euclid(3, 8, 2)[0]);
  });

  it("uses max length when pulse and rotation arrays differ in size", () => {
    const result = euclid([3, 4, 5], 8, [0, 1]);
    expect(result).toHaveLength(3);
  });
});
