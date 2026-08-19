import { describe, expect, it } from "vitest";
import {
  normalizeBusGain,
  normalizeBusName,
  normalizeBusTargets,
  normalizeDuckDepth,
  normalizeDuckTiming,
  normalizeSendAmount,
} from "./signal-graph";

describe("signal graph normalization", () => {
  describe("normalizeBusName", () => {
    it("trims surrounding whitespace", () => {
      expect(normalizeBusName("  drums  ")).toBe("drums");
    });

    it("preserves case and internal whitespace", () => {
      expect(normalizeBusName("  Drum Group  ")).toBe("Drum Group");
    });

    it.each(["", " ", "\t\n"])("rejects empty name %j", (name) => {
      expect(() => normalizeBusName(name)).toThrow(
        "Bus name must not be empty.",
      );
    });

    it("rejects non-string runtime input", () => {
      expect(() => normalizeBusName(42 as never)).toThrow(
        "Bus name must be a string.",
      );
    });
  });

  describe("normalizeBusTargets", () => {
    it("normalizes scalar and array targets identically", () => {
      expect(normalizeBusTargets(" drums ")).toEqual(["drums"]);
      expect(normalizeBusTargets([" drums "])).toEqual(["drums"]);
    });

    it("normalizes every target while preserving order", () => {
      expect(normalizeBusTargets([" music ", "Drum Group", "verb"])).toEqual([
        "music",
        "Drum Group",
        "verb",
      ]);
    });

    it("keeps duplicates deterministic for last-write-wins assignment", () => {
      const record: Record<string, number> = {};
      normalizeBusTargets(["verb", " verb ", "delay"]).forEach(
        (target, index) => {
          record[target] = index;
        },
      );

      expect(record).toEqual({ verb: 1, delay: 2 });
    });

    it("rejects an invalid name anywhere in an array", () => {
      expect(() => normalizeBusTargets(["drums", " ", "music"])).toThrow(
        "Bus name must not be empty.",
      );
    });
  });

  describe("normalizeBusGain", () => {
    it.each([0, 1, 2.5])("accepts finite non-negative gain %s", (gain) => {
      expect(normalizeBusGain(gain)).toBe(gain);
    });

    it("rejects negative gain", () => {
      expect(() => normalizeBusGain(-0.1)).toThrow(
        "Bus gain must be greater than or equal to zero.",
      );
    });

    it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
      "rejects non-finite gain %s",
      (gain) => {
        expect(() => normalizeBusGain(gain)).toThrow(
          "Bus gain must be a finite number.",
        );
      },
    );
  });

  describe("normalizeSendAmount", () => {
    it.each([0, 0.5, 1])("accepts send amount %s", (amount) => {
      expect(normalizeSendAmount(amount)).toBe(amount);
    });

    it.each([-0.1, 1.1])("rejects out-of-range amount %s", (amount) => {
      expect(() => normalizeSendAmount(amount)).toThrow(
        "Send amount must be between zero and one.",
      );
    });

    it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
      "rejects non-finite amount %s",
      (amount) => {
        expect(() => normalizeSendAmount(amount)).toThrow(
          "Send amount must be a finite number.",
        );
      },
    );
  });

  describe("duck normalization", () => {
    it.each([
      [-1, 0],
      [0, 0],
      [0.4, 0.4],
      [1, 1],
      [2, 1],
    ])("clamps depth %s to %s", (value, expected) => {
      expect(normalizeDuckDepth(value)).toBe(expected);
    });

    it.each(["onset", "recovery"] as const)(
      "clamps negative %s while preserving non-negative values",
      (label) => {
        expect(normalizeDuckTiming(-1, label)).toBe(0);
        expect(normalizeDuckTiming(0, label)).toBe(0);
        expect(normalizeDuckTiming(1.5, label)).toBe(1.5);
      },
    );

    it.each([
      ["depth", () => normalizeDuckDepth(Number.NaN)],
      ["onset", () => normalizeDuckTiming(Number.POSITIVE_INFINITY, "onset")],
      [
        "recovery",
        () => normalizeDuckTiming(Number.NEGATIVE_INFINITY, "recovery"),
      ],
    ])("rejects non-finite duck %s", (_field, normalize) => {
      expect(normalize).toThrow(/must be a finite number/);
    });
  });
});
