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

    it("defaults to undefined range and quantValue", () => {
      const schema = new RandomCycle().getRandomSchema();
      expect(schema.range).toBeUndefined();
      expect(schema.quantValue).toBeUndefined();
    });
  });

  describe("ribbon()", () => {
    it("creates two segments from array seeds and array loops", () => {
      const schema = new RandomCycle().ribbon([10, 20], [4, 8]).getRandomSchema();
      expect(schema.segments).toEqual([
        { seed: 10, len: 4 },
        { seed: 20, len: 8 },
      ]);
    });

    it("wraps loop lengths with modulo when arrays have mismatched lengths", () => {
      // seeds [10, 20, 30], loops [4] => 3 segments, all len: 4
      const schema = new RandomCycle().ribbon([10, 20, 30], [4]).getRandomSchema();
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

    it("euclid filters the inner cycle events", () => {
      // euclid(2, 4) => [1, 0, 1, 0] — pulses at steps 0 and 2
      const bar = new RandomCycle().steps(4).euclid(2, 4).getRandomSchema().cycle.cycle[0];
      expect(bar).toHaveLength(2);
      expect(bar[0].stepIndex).toBe(0);
      expect(bar[1].stepIndex).toBe(2);
    });
  });

  describe("configuration methods", () => {
    it("int() sets dataType to integer", () => {
      expect(new RandomCycle().int().getRandomSchema().dataType).toBe("integer");
    });

    it("bin() sets dataType to binary", () => {
      expect(new RandomCycle().bin().getRandomSchema().dataType).toBe("binary");
    });

    it("range() sets min and max", () => {
      expect(new RandomCycle().range(10, 20).getRandomSchema().range).toEqual({ min: 10, max: 20 });
    });

    it("quant() sets quantValue", () => {
      expect(new RandomCycle().quant(0.25).getRandomSchema().quantValue).toBe(0.25);
    });

    it("algo() sets algorithm", () => {
      expect(new RandomCycle().algo("mulberry").getRandomSchema().algorithm).toBe("mulberry");
    });
  });
});
