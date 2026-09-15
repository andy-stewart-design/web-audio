import { describe, expect, it } from "vitest";
import FixedTimingCycle from "./fixed-timing-cycle";

describe("FixedTimingCycle", () => {
  describe("getTimingPattern", () => {
    it("serializes the default single-step pattern as timing only", () => {
      expect(new FixedTimingCycle().getTimingPattern()).toEqual({
        cycle: [[{ duration: 1, offset: 0 }]],
      });
    });

    it("produces one timing step per Euclidean pulse", () => {
      const bar = new FixedTimingCycle().euclid(3, 8).getTimingPattern()
        .cycle[0];

      expect(bar).toEqual([
        { duration: 1 / 8, offset: 0 },
        { duration: 1 / 8, offset: 3 / 8 },
        { duration: 1 / 8, offset: 6 / 8 },
      ]);
    });

    it("serializes multi-bar Euclidean timing", () => {
      const bars = new FixedTimingCycle()
        .euclid([3, 4], 8)
        .getTimingPattern().cycle;

      expect(bars).toHaveLength(2);
      expect(bars[0]).toHaveLength(3);
      expect(bars[1]).toHaveLength(4);
    });

    it.each([
      {
        modifier: "xox",
        cycle: new FixedTimingCycle().xox("xox."),
      },
      {
        modifier: "hex",
        cycle: new FixedTimingCycle().hex("a"),
      },
    ])("preserves sparse timing after $modifier", ({ cycle }) => {
      expect(cycle.getTimingPattern().cycle[0]).toEqual([
        { duration: 0.25, offset: 0 },
        { duration: 0.25, offset: 0.5 },
      ]);
    });

    it("preserves sparse timing across sequence bars", () => {
      expect(
        new FixedTimingCycle().sequence(4, 0, 2).getTimingPattern().cycle,
      ).toEqual([
        [{ duration: 0.25, offset: 0 }],
        [{ duration: 0.25, offset: 0.5 }],
      ]);
    });

    it("omits fixed rests entirely", () => {
      expect(
        new FixedTimingCycle().xox("....").getTimingPattern().cycle,
      ).toEqual([[]]);
    });

    it("does not serialize values or grid indices", () => {
      const [step] = new FixedTimingCycle().getTimingPattern().cycle[0];

      expect(step).not.toHaveProperty("value");
      expect(step).not.toHaveProperty("stepIndex");
    });
  });
});
