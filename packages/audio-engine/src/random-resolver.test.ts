import { describe, expect, it } from "vitest";
import type { RandomSchema } from "@web-audio/schema";
import RandomResolver from "./random-resolver";

function makeSchema(overrides: Partial<RandomSchema> = {}): RandomSchema {
  return {
    type: "random",
    dataType: "float",
    segments: [{ seed: 42 }],
    quantValue: undefined,
    range: { min: 0, max: 100 },
    algorithm: "xor",
    cycle: {
      type: "static",
      polyphonic: false,
      cycle: [[{ value: 1, offset: 0, duration: 1, stepIndex: 0 }]],
    },
    ...overrides,
  };
}

describe("RandomResolver", () => {
  it("produces deterministic values for the same bar and step", () => {
    const resolver = new RandomResolver(makeSchema());
    const a = resolver.resolve(0, 0);
    const b = resolver.resolve(0, 0);
    expect(a).toBe(b);
  });

  it("produces different values for different bars", () => {
    const resolver = new RandomResolver(makeSchema());
    const a = resolver.resolve(0, 0);
    const b = resolver.resolve(1, 0);
    expect(a).not.toBe(b);
  });

  it("produces values within the specified range", () => {
    const schema = makeSchema({
      range: { min: 10, max: 20 },
      cycle: {
        type: "static",
        polyphonic: false,
        cycle: [
          Array.from({ length: 8 }, (_, i) => ({
            value: 1,
            offset: i / 8,
            duration: 1 / 8,
            stepIndex: i,
          })),
        ],
      },
    });
    const resolver = new RandomResolver(schema);
    for (let bar = 0; bar < 10; bar++) {
      for (let step = 0; step < 8; step++) {
        const v = resolver.resolve(bar, step);
        expect(v).toBeGreaterThanOrEqual(10);
        expect(v).toBeLessThanOrEqual(20);
      }
    }
  });

  it("produces integers when dataType is integer", () => {
    const schema = makeSchema({
      dataType: "integer",
      range: { min: 0, max: 100 },
      cycle: {
        type: "static",
        polyphonic: false,
        cycle: [
          Array.from({ length: 4 }, (_, i) => ({
            value: 1,
            offset: i / 4,
            duration: 1 / 4,
            stepIndex: i,
          })),
        ],
      },
    });
    const resolver = new RandomResolver(schema);
    for (let step = 0; step < 4; step++) {
      const v = resolver.resolve(0, step);
      expect(v).toBe(Math.floor(v));
    }
  });

  it("outputs 0 for masked-out steps", () => {
    const schema = makeSchema({
      cycle: {
        type: "static",
        polyphonic: false,
        cycle: [
          [
            { value: 1, offset: 0, duration: 0.5, stepIndex: 0 },
            { value: 0, offset: 0.5, duration: 0.5, stepIndex: 1 },
          ],
        ],
      },
    });
    const resolver = new RandomResolver(schema);
    const active = resolver.resolve(0, 0);
    const masked = resolver.resolve(0, 1);
    expect(active).not.toBe(0);
    expect(masked).toBe(0);
  });

  it("loops segments when len is provided", () => {
    const schema = makeSchema({
      segments: [
        { seed: 42, len: 2 },
        { seed: 99, len: 2 },
      ],
    });
    const resolver = new RandomResolver(schema);
    // Total period = 4. Bar 0 and bar 4 should use the same seed+offset.
    const a = resolver.resolve(0, 0);
    const b = resolver.resolve(4, 0);
    expect(a).toBe(b);
    // Bar 0 (seed 42) and bar 2 (seed 99) should differ.
    const c = resolver.resolve(2, 0);
    expect(a).not.toBe(c);
  });

  it("uses mulberry algorithm when specified", () => {
    const xorSchema = makeSchema({ algorithm: "xor" });
    const mulberrySchema = makeSchema({ algorithm: "mulberry" });
    const xorResolver = new RandomResolver(xorSchema);
    const mulberryResolver = new RandomResolver(mulberrySchema);
    // Same seed, different algorithm → different value
    expect(xorResolver.resolve(0, 0)).not.toBe(mulberryResolver.resolve(0, 0));
  });
});
