import { describe, expect, it } from "vitest";
import RandomCycle from "./random-cycle";

describe("RandomCycle", () => {
  describe("getRandomSchema defaults", () => {
    it("produces a single segment with the base seed when ribbon is not called", () => {
      const schema = new RandomCycle().getRandomSchema();
      expect(schema.segments).toEqual([{ seed: 0 }]);
    });

    it("defaults to float dataType", () => {
      expect(new RandomCycle().getRandomSchema().dataType).toBe("float");
    });

    it("defaults to xor algorithm", () => {
      expect(new RandomCycle().getRandomSchema().algorithm).toBe("xor");
    });

    it("defaults to undefined range, quantValue, and chance", () => {
      const schema = new RandomCycle().getRandomSchema();
      expect(schema.range).toBeUndefined();
      expect(schema.quantValue).toBeUndefined();
      expect(schema.chance).toBeUndefined();
    });
  });

  describe("ribbon()", () => {
    it("creates two segments from array seeds and array loops", () => {
      const schema = new RandomCycle()
        .ribbon([10, 20], [4, 8])
        .getRandomSchema();
      expect(schema.segments).toEqual([
        { seed: 10, len: 4 },
        { seed: 20, len: 8 },
      ]);
    });

    it("wraps loop lengths with modulo when arrays have mismatched lengths", () => {
      // seeds [10, 20, 30], loops [4] => 3 segments, all len: 4
      const schema = new RandomCycle()
        .ribbon([10, 20, 30], [4])
        .getRandomSchema();
      expect(schema.segments).toHaveLength(3);
      expect(schema.segments.every((s) => s.len === 4)).toBe(true);
    });

    it("wraps seeds with modulo when loop array is longer than seed array", () => {
      // seeds [10], loops [4, 8] => 2 segments, seeds alternate
      const schema = new RandomCycle().ribbon([10], [4, 8]).getRandomSchema();
      expect(schema.segments).toEqual([
        { seed: 10, len: 4 },
        { seed: 10, len: 8 },
      ]);
    });

    it("omits len when loop is not provided", () => {
      const schema = new RandomCycle().ribbon(42).getRandomSchema();
      expect(schema.segments).toEqual([{ seed: 42 }]);
    });

    it("a scalar seed produces one segment", () => {
      const schema = new RandomCycle().ribbon(99, 8).getRandomSchema();
      expect(schema.segments).toEqual([{ seed: 99, len: 8 }]);
    });
  });

  describe("inner cycle geometry", () => {
    it("steps(4) produces a 4-step inner cycle", () => {
      const schema = new RandomCycle().steps(4).getRandomSchema();
      expect(schema.cycle.cycle[0]).toHaveLength(4);
    });

    it("creates a repeating sequence of active and empty bars", () => {
      const bars = new RandomCycle().steps(16, 0, 8).getRandomSchema()
        .cycle.cycle;

      expect(bars).toHaveLength(3);
      expect(bars.map((bar) => bar.length)).toEqual([16, 0, 8]);
      expect(bars[0][0]).toMatchObject({
        duration: 1 / 16,
        offset: 0,
        stepIndex: 0,
      });
      expect(bars[0][15]).toMatchObject({
        duration: 1 / 16,
        offset: 15 / 16,
        stepIndex: 15,
      });
      expect(bars[1]).toEqual([]);
      expect(bars[2][7]).toMatchObject({
        duration: 1 / 8,
        offset: 7 / 8,
        stepIndex: 7,
      });
    });

    it("rejects missing, negative, fractional, and non-finite step counts", () => {
      expect(() => new RandomCycle().steps()).toThrow(
        "requires at least one step count",
      );

      for (const count of [-1, 1.5, Infinity, NaN]) {
        expect(() => new RandomCycle().steps(count)).toThrow(
          "counts must be finite, non-negative integers",
        );
      }
    });

    it("euclid filters the inner cycle events", () => {
      // euclid(2, 4) => [1, 0, 1, 0] — pulses at steps 0 and 2
      const bar = new RandomCycle().steps(4).euclid(2, 4).getRandomSchema()
        .cycle.cycle[0];
      expect(bar).toHaveLength(2);
      expect(bar[0].stepIndex).toBe(0);
      expect(bar[1].stepIndex).toBe(2);
    });
  });

  describe("configuration methods", () => {
    it("int() sets dataType to integer", () => {
      expect(new RandomCycle().int().getRandomSchema().dataType).toBe(
        "integer",
      );
    });

    it("bin() sets dataType to binary", () => {
      expect(new RandomCycle().bin().getRandomSchema().dataType).toBe("binary");
    });

    it("serializes binary chance regardless of whether bin() comes first", () => {
      expect(
        new RandomCycle().bin().chance(0.6).getRandomSchema(),
      ).toMatchObject({
        dataType: "binary",
        chance: 0.6,
      });
      expect(
        new RandomCycle().chance(0.6).bin().getRandomSchema(),
      ).toMatchObject({
        dataType: "binary",
        chance: 0.6,
      });
    });

    it("uses the latest configured chance", () => {
      expect(
        new RandomCycle().bin().chance(0.25).chance(0.75).getRandomSchema()
          .chance,
      ).toBe(0.75);
    });

    it("accepts chance probability boundaries", () => {
      expect(new RandomCycle().bin().chance(0).getRandomSchema().chance).toBe(
        0,
      );
      expect(new RandomCycle().bin().chance(1).getRandomSchema().chance).toBe(
        1,
      );
    });

    it("rejects invalid chance probabilities immediately", () => {
      for (const probability of [-0.01, 1.01, Infinity, -Infinity, NaN]) {
        expect(() => new RandomCycle().chance(probability)).toThrow(
          "probability must be a finite number from 0 to 1",
        );
      }
    });

    it("rejects chance unless the final random type is binary", () => {
      expect(() => new RandomCycle().chance(0.6).getRandomSchema()).toThrow(
        "only valid for binary random cycles",
      );
      expect(() =>
        new RandomCycle().bin().chance(0.6).int().getRandomSchema(),
      ).toThrow("only valid for binary random cycles");
    });

    it("range() sets min and max", () => {
      expect(new RandomCycle().range(10, 20).getRandomSchema().range).toEqual({
        min: 10,
        max: 20,
      });
    });

    it("quant() sets quantValue", () => {
      expect(new RandomCycle().quant(0.25).getRandomSchema().quantValue).toBe(
        0.25,
      );
    });

    it("algo() sets algorithm", () => {
      expect(
        new RandomCycle().algo("mulberry").getRandomSchema().algorithm,
      ).toBe("mulberry");
    });
  });
});
