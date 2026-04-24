import { describe, expect, it } from "vitest";
import { ChordCycle } from "./static-cycles";

describe("ChordCycle", () => {
  describe("getStaticSchema", () => {
    it("serializes a chord with correct values and geometry", () => {
      const bar = new ChordCycle([60, 64, 67]).getStaticSchema().cycle[0];
      expect(bar.map((n) => n.value)).toEqual([60, 64, 67]);
      expect(bar.every((n) => n.offset === 0)).toBe(true);
      expect(bar.every((n) => n.duration === 1)).toBe(true);
      expect(bar.every((n) => n.stepIndex === 0)).toBe(true);
    });

    it("applies transformer to every note value", () => {
      const values = new ChordCycle([60, 64, 67])
        .getStaticSchema((v) => v + 12)
        .cycle[0].map((n) => n.value);
      expect(values).toEqual([72, 76, 79]);
    });

    it("transformer does not mutate internal state", () => {
      const cycle = new ChordCycle([60, 64, 67]);
      cycle.getStaticSchema((v) => v + 12);
      expect(cycle.getStaticSchema().cycle[0].map((n) => n.value)).toEqual([
        60, 64, 67,
      ]);
    });

    it("null chord steps (from applyPattern) emit no events", () => {
      // euclid(1, 2) => [1, 0] — step 1 is null, so only step 0 contributes events
      const bar = new ChordCycle([60, 64, 67]).euclid(1, 2).getStaticSchema()
        .cycle[0];
      expect(bar).toHaveLength(3);
      expect(bar.every((n) => n.stepIndex === 0)).toBe(true);
    });

    it("returns polyphonic: true", () => {
      expect(new ChordCycle([60]).getStaticSchema().polyphonic).toBe(true);
    });

    it("step offsets reflect position within multi-step pattern", () => {
      // pattern([[60], [64]]) sets one bar with two chord steps
      const cycle = new ChordCycle([60]);
      cycle.pattern([[60], [64]]);
      const bar = cycle.getStaticSchema().cycle[0];
      expect(bar[0]).toMatchObject({ offset: 0, duration: 0.5, stepIndex: 0 });
      expect(bar[1]).toMatchObject({
        offset: 0.5,
        duration: 0.5,
        stepIndex: 1,
      });
    });
  });
});
