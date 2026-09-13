import type { RandomNumberPattern } from "@web-audio/schema";
import { describe, expect, it } from "vitest";
import RandomResolver from "./random-resolver";

function makeSchema(
  overrides: Partial<RandomNumberPattern> = {},
): RandomNumberPattern {
  return {
    type: "random-number",
    valuesPerBar: [1],
    dataType: "float",
    segments: [{ seed: 42 }],
    range: { min: 0, max: 100 },
    algorithm: "xor",
    order: "forward",
    ...overrides,
  };
}

describe("RandomResolver", () => {
  it("produces deterministic values for the same bar and hit", () => {
    const resolver = new RandomResolver(makeSchema());
    expect(resolver.resolve(0, 0)).toBe(resolver.resolve(0, 0));
  });

  it("uses valuesPerBar as the only generation count", () => {
    const resolver = new RandomResolver(
      makeSchema({ valuesPerBar: [2, 0, 3] }),
    );

    expect(resolver.resolve(0, 2)).toBe(resolver.resolve(0, 0));
    expect(() => resolver.resolve(1, 0)).toThrow(
      "Cannot resolve a random value from an empty bar",
    );
    expect(resolver.resolve(2, 3)).toBe(resolver.resolve(2, 0));
    expect(resolver.resolve(3, 2)).toBe(resolver.resolve(3, 0));
  });

  it("produces different values for different playback bars", () => {
    const resolver = new RandomResolver(makeSchema());
    expect(resolver.resolve(0, 0)).not.toBe(resolver.resolve(1, 0));
  });

  it("produces values within the specified range", () => {
    const resolver = new RandomResolver(
      makeSchema({ valuesPerBar: [8], range: { min: 10, max: 20 } }),
    );

    for (let bar = 0; bar < 10; bar++) {
      for (let hit = 0; hit < 8; hit++) {
        expect(resolver.resolve(bar, hit)).toBeGreaterThanOrEqual(10);
        expect(resolver.resolve(bar, hit)).toBeLessThanOrEqual(20);
      }
    }
  });

  it.each([
    ["integer", Number.isInteger],
    ["binary", (value: number) => value === 0 || value === 1],
  ] as const)("produces valid %s values", (dataType, isValid) => {
    const resolver = new RandomResolver(
      makeSchema({ dataType, valuesPerBar: [16], range: { min: 0, max: 1 } }),
    );

    expect(
      Array.from({ length: 16 }, (_, hit) => resolver.resolve(0, hit)).every(
        isValid,
      ),
    ).toBe(true);
  });

  it("quantizes generated values", () => {
    const resolver = new RandomResolver(
      makeSchema({
        valuesPerBar: [16],
        quantValue: 0.25,
        range: { min: 0, max: 1 },
      }),
    );

    for (let hit = 0; hit < 16; hit++) {
      expect(resolver.resolve(0, hit) % 0.25).toBe(0);
    }
  });

  it("selects every value-map entry over enough bars", () => {
    const valueMap = [60, 62, 64, 65, 67, 69, 71];
    const resolver = new RandomResolver(makeSchema({ valueMap }));
    const results = new Set<number>();

    for (let bar = 0; bar < 200; bar++) results.add(resolver.resolve(bar, 0));

    expect(results).toEqual(new Set(valueMap));
  });

  it("uses binary output to select binary value-map entries", () => {
    const resolver = new RandomResolver(
      makeSchema({
        dataType: "binary",
        valuesPerBar: [16],
        range: { min: 0, max: 1 },
        valueMap: [57, 59],
      }),
    );

    const values = Array.from({ length: 16 }, (_, hit) =>
      resolver.resolve(0, hit),
    );
    expect(new Set(values)).toEqual(new Set([57, 59]));
  });

  it("loops bounded ribbon segments", () => {
    const resolver = new RandomResolver(
      makeSchema({
        segments: [
          { seed: 42, len: 2 },
          { seed: 99, len: 2 },
        ],
      }),
    );

    expect(resolver.resolve(0, 0)).toBe(resolver.resolve(4, 0));
    expect(resolver.resolve(0, 0)).not.toBe(resolver.resolve(2, 0));
  });

  it("uses mulberry generation", () => {
    const xor = new RandomResolver(makeSchema()).resolve(0, 0);
    const mulberry = new RandomResolver(
      makeSchema({ algorithm: "mulberry" }),
    ).resolve(0, 0);

    expect(mulberry).not.toBe(xor);
  });

  it("reverses generated values within each bar", () => {
    const schema = makeSchema({ valuesPerBar: [8] });
    const forward = new RandomResolver(schema);
    const reverse = new RandomResolver({ ...schema, order: "reverse" });
    const forwardValues = Array.from({ length: 8 }, (_, hit) =>
      forward.resolve(3, hit),
    );
    const reverseValues = Array.from({ length: 8 }, (_, hit) =>
      reverse.resolve(3, hit),
    );

    expect(reverseValues).toEqual(forwardValues.toReversed());
  });
});
