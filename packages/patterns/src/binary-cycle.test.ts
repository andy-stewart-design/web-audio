import { describe, expect, it } from "vitest";
import { BinaryCycle } from "./static-cycles";

describe("BinaryCycle", () => {
  describe("getStaticSchema", () => {
    it("serializes the default single-step pattern", () => {
      const bar = new BinaryCycle().getStaticSchema().cycle[0];
      expect(bar).toEqual([{ value: 1, duration: 1, offset: 0, stepIndex: 0 }]);
    });

    it("produces one event per pulse with correct geometry after euclid()", () => {
      // euclid(3, 8) => [1, 0, 0, 1, 0, 0, 1, 0] — pulses at steps 0, 3, 6
      const bar = new BinaryCycle().euclid(3, 8).getStaticSchema().cycle[0];
      expect(bar).toHaveLength(3);
      expect(bar[0]).toEqual({ value: 1, duration: 1 / 8, offset: 0, stepIndex: 0 });
      expect(bar[1]).toEqual({ value: 1, duration: 1 / 8, offset: 3 / 8, stepIndex: 3 });
      expect(bar[2]).toEqual({ value: 1, duration: 1 / 8, offset: 6 / 8, stepIndex: 6 });
    });

    it("euclid([3, 4], 8) produces two bars", () => {
      const schema = new BinaryCycle().euclid([3, 4], 8).getStaticSchema();
      expect(schema.cycle).toHaveLength(2);
      expect(schema.cycle[0]).toHaveLength(3);
      expect(schema.cycle[1]).toHaveLength(4);
    });

    it("filters out zero-value steps", () => {
      // euclid(1, 4) => [1, 0, 0, 0]
      const bar = new BinaryCycle().euclid(1, 4).getStaticSchema().cycle[0];
      expect(bar).toHaveLength(1);
      expect(bar[0].stepIndex).toBe(0);
    });

    it("returns polyphonic: false", () => {
      expect(new BinaryCycle().getStaticSchema().polyphonic).toBe(false);
    });

    it("offset and duration are consistent with step count", () => {
      // euclid(2, 4) => [1, 0, 1, 0]
      const bar = new BinaryCycle().euclid(2, 4).getStaticSchema().cycle[0];
      for (const step of bar) {
        expect(step.duration).toBeCloseTo(1 / 4);
      }
      expect(bar[0].offset).toBeCloseTo(0);
      expect(bar[1].offset).toBeCloseTo(2 / 4);
    });
  });
});
