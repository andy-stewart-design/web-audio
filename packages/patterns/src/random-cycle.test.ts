import { describe, expect, it } from "vitest";
import RandomCycle from "./random-cycle";

describe("RandomCycle", () => {
  describe("getRandomSchema", () => {
    it("serializes the default numeric random pattern", () => {
      expect(new RandomCycle().getRandomSchema()).toEqual({
        type: "random-number",
        valuesPerBar: [1],
        dataType: "float",
        range: undefined,
        segments: [{ seed: 0 }],
        algorithm: "xor",
        quantValue: undefined,
        order: "forward",
      });
    });

    it("serializes multi-bar value counts including zero", () => {
      expect(
        new RandomCycle().steps(16, 0, 8).getRandomSchema().valuesPerBar,
      ).toEqual([16, 0, 8]);
    });

    it("counts active positions after fixed pattern operations", () => {
      expect(
        new RandomCycle().steps(8).euclid(3, 8).getRandomSchema().valuesPerBar,
      ).toEqual([3]);
    });

    it("contains no timing grid or chance policy", () => {
      const schema = new RandomCycle().steps(4).getRandomSchema();

      expect(schema).not.toHaveProperty("grid");
      expect(schema).not.toHaveProperty("chance");
      expect(schema).not.toHaveProperty("condition");
    });

    it("serializes reversed bar counts and generated-value order", () => {
      expect(
        new RandomCycle().steps(2, 4).reverse().getRandomSchema(),
      ).toMatchObject({
        valuesPerBar: [4, 2],
        order: "reverse",
      });
      expect(
        new RandomCycle().steps(2, 4).reverse().reverse().getRandomSchema(),
      ).toMatchObject({ valuesPerBar: [2, 4], order: "forward" });
    });

    it("supports binary random values when chance is not configured", () => {
      expect(new RandomCycle().bin().getRandomSchema()).toMatchObject({
        type: "random-number",
        dataType: "binary",
      });
    });

    it("rejects chance-configured cycles used as numeric values", () => {
      expect(() =>
        new RandomCycle().bin().chance(0.6).getRandomSchema(),
      ).toThrow(
        "[Pattern] RandomCycle.chance() configures event timing and cannot be serialized as a numeric value pattern.",
      );
    });
  });

  describe("ribbon()", () => {
    it("serializes bounded ribbon segments", () => {
      expect(
        new RandomCycle().ribbon([10, 20], [4, 8]).getRandomSchema().segments,
      ).toEqual([
        { seed: 10, len: 4 },
        { seed: 20, len: 8 },
      ]);
    });

    it("wraps loop lengths when arrays have mismatched lengths", () => {
      expect(
        new RandomCycle().ribbon([10, 20, 30], [4]).getRandomSchema().segments,
      ).toEqual([
        { seed: 10, len: 4 },
        { seed: 20, len: 4 },
        { seed: 30, len: 4 },
      ]);
    });

    it("wraps seeds when the loop array is longer", () => {
      expect(
        new RandomCycle().ribbon([10], [4, 8]).getRandomSchema().segments,
      ).toEqual([
        { seed: 10, len: 4 },
        { seed: 10, len: 8 },
      ]);
    });

    it("serializes an unbounded ribbon as one segment without len", () => {
      expect(new RandomCycle().ribbon(42).getRandomSchema().segments).toEqual([
        { seed: 42 },
      ]);
    });

    it("serializes a scalar bounded ribbon", () => {
      expect(
        new RandomCycle().ribbon(99, 8).getRandomSchema().segments,
      ).toEqual([{ seed: 99, len: 8 }]);
    });
  });

  describe("getTimingSchema", () => {
    it("exposes chance-free candidate timing for random values", () => {
      const timing = new RandomCycle().steps(2, 0, 3).candidateTiming;

      expect(timing.cycle.map((bar) => bar.length)).toEqual([2, 0, 3]);
      expect(timing.condition).toBeUndefined();
    });

    it("uses probability 0.5 for binary timing without explicit chance", () => {
      const schema = new RandomCycle().bin().steps(4).getTimingSchema();

      expect(schema.cycle[0]).toEqual([
        { duration: 0.25, offset: 0 },
        { duration: 0.25, offset: 0.25 },
        { duration: 0.25, offset: 0.5 },
        { duration: 0.25, offset: 0.75 },
      ]);
      expect(schema.condition).toEqual({
        type: "chance",
        probability: 0.5,
        segments: [{ seed: 0 }],
        algorithm: "xor",
        order: "forward",
      });
    });

    it("serializes one fractional chance condition", () => {
      expect(
        new RandomCycle()
          .chance(0.25)
          .bin()
          .ribbon([10, 20], [4, 8])
          .algo("mulberry")
          .getTimingSchema().condition,
      ).toEqual({
        type: "chance",
        probability: 0.25,
        segments: [
          { seed: 10, len: 4 },
          { seed: 20, len: 8 },
        ],
        algorithm: "mulberry",
        order: "forward",
      });
    });

    it("preserves reverse order in the timing condition", () => {
      expect(
        new RandomCycle().bin().reverse().getTimingSchema().condition?.order,
      ).toBe("reverse");
    });

    it("uses the latest configured chance", () => {
      expect(
        new RandomCycle().bin().chance(0.25).chance(0.75).getTimingSchema()
          .condition?.probability,
      ).toBe(0.75);
    });

    it("compiles probability one as fixed timing without a condition", () => {
      const schema = new RandomCycle()
        .bin()
        .chance(1)
        .steps(2)
        .getTimingSchema();

      expect(schema).toEqual({
        cycle: [
          [
            { duration: 0.5, offset: 0 },
            { duration: 0.5, offset: 0.5 },
          ],
        ],
      });
    });

    it("compiles probability zero as empty timing bars", () => {
      expect(
        new RandomCycle().bin().chance(0).steps(16, 0, 8).getTimingSchema(),
      ).toEqual({ cycle: [[], [], []] });
    });

    it("preserves fixed operations in candidate timing", () => {
      expect(
        new RandomCycle().bin().steps(4).euclid(2, 4).getTimingSchema()
          .cycle[0],
      ).toEqual([
        { duration: 0.25, offset: 0 },
        { duration: 0.25, offset: 0.5 },
      ]);
    });

    it("rejects non-binary random timing", () => {
      expect(() => new RandomCycle().getTimingSchema()).toThrow(
        "[Pattern] RandomCycle event timing requires a binary random cycle. Call .bin() before using it as timing.",
      );
      expect(() =>
        new RandomCycle().bin().chance(0.5).int().getTimingSchema(),
      ).toThrow("requires a binary random cycle");
    });
  });

  describe("configuration", () => {
    it("preserves data type, range, quantization, algorithm, and order", () => {
      expect(
        new RandomCycle()
          .int()
          .range(10, 20)
          .quant(0.25)
          .algo("mulberry")
          .getRandomSchema(),
      ).toMatchObject({
        dataType: "integer",
        range: { min: 10, max: 20 },
        quantValue: 0.25,
        algorithm: "mulberry",
        order: "forward",
      });
    });

    it("returns snapshots that cannot mutate later output", () => {
      const cycle = new RandomCycle().steps(2).range(10, 20).ribbon(7, 4);
      const first = cycle.getRandomSchema();

      first.valuesPerBar[0] = 99;
      first.segments[0].seed = 99;
      if (first.range) first.range.min = 99;

      expect(cycle.getRandomSchema()).toMatchObject({
        valuesPerBar: [2],
        segments: [{ seed: 7, len: 4 }],
        range: { min: 10, max: 20 },
      });
    });

    it("rejects invalid step counts", () => {
      expect(() => new RandomCycle().steps()).toThrow(
        "requires at least one step count",
      );

      for (const count of [-1, 1.5, Infinity, NaN]) {
        expect(() => new RandomCycle().steps(count)).toThrow(
          "counts must be finite, non-negative integers",
        );
      }
    });

    it("rejects invalid chance probabilities immediately", () => {
      for (const probability of [-0.01, 1.01, Infinity, -Infinity, NaN]) {
        expect(() => new RandomCycle().chance(probability)).toThrow(
          "probability must be a finite number from 0 to 1",
        );
      }
    });
  });
});
