import { describe, expect, it } from "vitest";
import { BinaryCycle } from "./static-cycles";

describe("BinaryCycle", () => {
  describe("getTimingSchema", () => {
    it("serializes the default single-step pattern as timing only", () => {
      expect(new BinaryCycle().getTimingSchema()).toEqual({
        cycle: [[{ duration: 1, offset: 0 }]],
      });
    });

    it("produces one timing step per Euclidean pulse", () => {
      const bar = new BinaryCycle().euclid(3, 8).getTimingSchema().cycle[0];

      expect(bar).toEqual([
        { duration: 1 / 8, offset: 0 },
        { duration: 1 / 8, offset: 3 / 8 },
        { duration: 1 / 8, offset: 6 / 8 },
      ]);
    });

    it("serializes multi-bar Euclidean timing", () => {
      const bars = new BinaryCycle().euclid([3, 4], 8).getTimingSchema().cycle;

      expect(bars).toHaveLength(2);
      expect(bars[0]).toHaveLength(3);
      expect(bars[1]).toHaveLength(4);
    });

    it.each([
      {
        modifier: "xox",
        cycle: new BinaryCycle().xox("xox."),
      },
      {
        modifier: "hex",
        cycle: new BinaryCycle().hex("a"),
      },
    ])("preserves sparse timing after $modifier", ({ cycle }) => {
      expect(cycle.getTimingSchema().cycle[0]).toEqual([
        { duration: 0.25, offset: 0 },
        { duration: 0.25, offset: 0.5 },
      ]);
    });

    it("preserves sparse timing across sequence bars", () => {
      expect(
        new BinaryCycle().sequence(4, 0, 2).getTimingSchema().cycle,
      ).toEqual([
        [{ duration: 0.25, offset: 0 }],
        [{ duration: 0.25, offset: 0.5 }],
      ]);
    });

    it("omits fixed rests entirely", () => {
      expect(new BinaryCycle().xox("....").getTimingSchema().cycle).toEqual([
        [],
      ]);
    });

    it("does not serialize values or grid indices", () => {
      const [step] = new BinaryCycle().getTimingSchema().cycle[0];

      expect(step).not.toHaveProperty("value");
      expect(step).not.toHaveProperty("stepIndex");
    });
  });
});
