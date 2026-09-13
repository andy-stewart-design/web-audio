import type { RandomNumberPattern } from "@web-audio/schema";
import { describe, expect, it } from "vitest";
import ValuePatternResolver from "./value-pattern-resolver";

const randomPattern: RandomNumberPattern = {
  type: "random-number",
  valuesPerBar: [2, 0, 3],
  dataType: "integer",
  segments: [{ seed: 42 }],
  range: { min: 10, max: 20 },
  algorithm: "xor",
  order: "forward",
};

describe("ValuePatternResolver", () => {
  it("wraps static patterns independently by bar and hit", () => {
    const resolver = new ValuePatternResolver();
    const pattern = {
      type: "static" as const,
      cycle: [
        [0, -2],
        [0.25, 0.75, 1.25],
      ],
    };

    expect(resolver.resolve(pattern, 0, 0)).toBe(0);
    expect(resolver.resolve(pattern, 0, 3)).toBe(-2);
    expect(resolver.resolve(pattern, 3, 4)).toBe(0.75);
  });

  it("resolves grouped static event values without inspecting them", () => {
    const resolver = new ValuePatternResolver();
    const pattern = {
      type: "static" as const,
      cycle: [[[60, 64], [67]]],
    };

    expect(resolver.resolve(pattern, 0, 0)).toEqual([60, 64]);
    expect(resolver.resolve(pattern, 0, 3)).toEqual([67]);
  });

  it("rejects unreachable empty static bars", () => {
    expect(() =>
      new ValuePatternResolver().resolve({ type: "static", cycle: [[]] }, 0, 0),
    ).toThrow("Cannot resolve a static value from an empty bar");
  });

  it("delegates random values by playback bar and final hit", () => {
    const resolver = new ValuePatternResolver();

    expect(resolver.resolve(randomPattern, 0, 2)).toBe(
      resolver.resolve(randomPattern, 0, 0),
    );
    expect(() => resolver.resolve(randomPattern, 1, 0)).toThrow(
      "Cannot resolve a random value from an empty bar",
    );
    expect(resolver.resolve(randomPattern, 2, 3)).toBe(
      resolver.resolve(randomPattern, 2, 0),
    );
  });
});
