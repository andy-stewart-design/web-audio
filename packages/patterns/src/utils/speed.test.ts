import { describe, expect, it } from "vitest";
import Speed from "./speed";

describe("Speed", () => {
  it("starts at unit speed", () => {
    expect(new Speed().isUnit).toBe(true);
  });

  it("leaves cycles unchanged when no rest value is available", () => {
    expect(new Speed().multiply(2).applyTo([[1], [2]], undefined)).toBeNull();
  });

  it("compresses and expands complete multi-bar cycles", () => {
    expect(new Speed().multiply(2).applyTo([[1], [2], [3], [4]], 0)).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(new Speed().divide(2).applyTo([[1, 2]], 0)).toEqual([
      [1, 0],
      [2, 0],
    ]);
  });

  it("repeats a complete source phrase when compression groups do not divide it", () => {
    expect(new Speed().multiply(2).applyTo([[1], [2], [3]], 0)).toEqual([
      [1, 2],
      [3, 1],
      [2, 3],
    ]);
  });

  it("compiles fractional speeds as reduced rational rates", () => {
    const cycle = [[1], [2], [3], [4], [5], [6]];
    const fractional = new Speed().multiply(1.5).applyTo(cycle, 0);
    const composed = new Speed().multiply(3).divide(2).applyTo(cycle, 0);

    expect(fractional).toEqual(composed);
    expect(new Speed().multiply(0.5).applyTo(cycle, 0)).toEqual(
      new Speed().divide(2).applyTo(cycle, 0),
    );
    expect(new Speed().multiply(4 / 3).applyTo(cycle, 0)).not.toBeNull();
  });

  it("guards transformed cycle size", () => {
    expect(() =>
      new Speed().divide(64).applyTo(
        Array.from({ length: 17 }, () => [1]),
        0,
      ),
    ).toThrow("more than 1024 bars");
    expect(() =>
      new Speed().divide(64).applyTo([Array.from({ length: 300 }, () => 1)], 0),
    ).toThrow("more than 16384 events");
  });

  it("rejects non-positive, non-finite, and unsupported irrational rates", () => {
    for (const multiplier of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => new Speed().multiply(multiplier)).toThrow(
        "Speed multipliers must be positive finite numbers",
      );
    }
    expect(() => new Speed().divide(Math.PI)).toThrow(
      "must be representable with a denominator",
    );
  });
});
