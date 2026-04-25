import { describe, expect, it } from "vitest";
import { ValueCycle } from "./static-cycles";

describe("ValueCycle", () => {
  describe("getStaticSchema", () => {
    it("serializes each step with correct geometry", () => {
      const bar = new ValueCycle([60, 64, 67], 0).getStaticSchema().cycle[0];
      expect(bar).toHaveLength(3);
      expect(bar[0]).toEqual({
        value: 60,
        duration: 1 / 3,
        offset: 0,
        stepIndex: 0,
      });
      expect(bar[1]).toEqual({
        value: 64,
        duration: 1 / 3,
        offset: 1 / 3,
        stepIndex: 1,
      });
      expect(bar[2]).toEqual({
        value: 67,
        duration: 1 / 3,
        offset: 2 / 3,
        stepIndex: 2,
      });
    });

    it("emits null-value steps — does not filter like BinaryCycle", () => {
      // euclid(1, 4) leaves 3 null steps; ValueCycle must still emit all 4 steps
      const bar = new ValueCycle([60, 64, 67], 0).euclid(1, 4).getStaticSchema()
        .cycle[0];
      expect(bar).toHaveLength(4);
      expect(bar[0].value).toBe(60);
      expect(bar[1].value).toBe(0);
      expect(bar[2].value).toBe(0);
      expect(bar[3].value).toBe(0);
    });

    it("stepIndex matches position in pattern", () => {
      const bar = new ValueCycle([10, 20, 30], 0).getStaticSchema().cycle[0];
      expect(bar.map((s) => s.stepIndex)).toEqual([0, 1, 2]);
    });

    it("returns polyphonic: false", () => {
      expect(new ValueCycle([60], 0).getStaticSchema().polyphonic).toBe(false);
    });
  });
});
