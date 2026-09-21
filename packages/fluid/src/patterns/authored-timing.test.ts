import { RandomCycle } from "@web-audio/patterns";
import { describe, expect, it } from "vitest";
import AuthoredTiming from "./authored-timing";

describe("AuthoredTiming", () => {
  it("keeps fixed candidate timing separate from inferred timing", () => {
    const timing = new AuthoredTiming();

    expect(timing.isExplicit).toBe(false);
    expect(timing.getTimingPattern()).toBeUndefined();

    timing.xox([1, 0, 1, 0]);

    expect(timing.isExplicit).toBe(true);
    expect(timing.getTimingPattern()).toEqual({
      cycle: [
        [
          { offset: 0, duration: 0.25 },
          { offset: 0.5, duration: 0.25 },
        ],
      ],
    });
  });

  it("replaces timing from random XOX and retains its condition through fixed composition", () => {
    const timing = new AuthoredTiming()
      .xox([1, 0])
      .setRandomXox(new RandomCycle().bin().steps(4).chance(0.75))
      .xox([1, 0, 1, 0]);

    expect(timing.getTimingPattern()).toMatchObject({
      cycle: [
        [
          { offset: 0, duration: 0.25 },
          { offset: 0.5, duration: 0.25 },
        ],
      ],
      condition: { type: "chance", probability: 0.75 },
    });
  });

  it("keeps chance conditions aligned with transformed candidates", () => {
    const timing = new AuthoredTiming().setRandomXox(
      new RandomCycle().bin().steps(2, 3).chance(0.5),
    );

    timing.fast(2);
    const fast = timing.getTimingPattern();
    if (!fast) throw new Error("Expected explicit timing.");
    expect(fast.cycle.map((bar) => bar.length)).toEqual([5]);

    timing.reverse();
    const reverse = timing.getTimingPattern();
    if (!reverse || !("condition" in reverse)) {
      throw new Error("Expected chance timing.");
    }
    expect(reverse.condition?.order).toBe("reverse");
  });

  it("simplifies probability boundaries only when compiling", () => {
    const zero = new AuthoredTiming()
      .setRandomXox(new RandomCycle().bin().steps(4).chance(0))
      .xox([1, 0, 1, 0]);
    const one = new AuthoredTiming()
      .setRandomXox(new RandomCycle().bin().steps(4).chance(1))
      .xox([1, 0, 1, 0]);

    expect(zero.getTimingPattern()).toEqual({ cycle: [[]] });
    expect(one.getTimingPattern()).toEqual({
      cycle: [
        [
          { offset: 0, duration: 0.25 },
          { offset: 0.5, duration: 0.25 },
        ],
      ],
    });
  });
});
