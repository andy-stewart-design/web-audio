import type { ChanceCondition, TimingPattern } from "@web-audio/schema";
import { describe, expect, it } from "vitest";
import { resolveTiming } from "./resolve-timing";

const fourSteps = [
  { offset: 0, duration: 0.25 },
  { offset: 0.25, duration: 0.25 },
  { offset: 0.5, duration: 0.25 },
  { offset: 0.75, duration: 0.25 },
];

const eightSteps = Array.from({ length: 8 }, (_, index) => ({
  offset: index / 8,
  duration: 0.125,
}));

function condition(overrides: Partial<ChanceCondition> = {}): ChanceCondition {
  return {
    type: "chance",
    probability: 0.5,
    segments: [{ seed: 42 }],
    algorithm: "xor",
    order: "forward",
    ...overrides,
  };
}

describe("resolveTiming", () => {
  it("returns fixed candidates with consecutive hit indices", () => {
    expect(resolveTiming({ cycle: [fourSteps] }, 0)).toEqual([
      { hitIndex: 0, offset: 0, duration: 0.25 },
      { hitIndex: 1, offset: 0.25, duration: 0.25 },
      { hitIndex: 2, offset: 0.5, duration: 0.25 },
      { hitIndex: 3, offset: 0.75, duration: 0.25 },
    ]);
  });

  it("wraps timing bars independently by playback bar", () => {
    const timing: TimingPattern = {
      cycle: [
        [{ offset: 0, duration: 1 }],
        [
          { offset: 0, duration: 0.5 },
          { offset: 0.5, duration: 0.5 },
        ],
      ],
    };

    expect(resolveTiming(timing, 3)).toEqual([
      { hitIndex: 0, offset: 0, duration: 0.5 },
      { hitIndex: 1, offset: 0.5, duration: 0.5 },
    ]);
  });

  it("evaluates chance once per candidate and removes hit-number gaps", () => {
    const events = resolveTiming(
      { cycle: [eightSteps], condition: condition() },
      0,
    );

    expect(events.map(({ offset }) => offset)).toEqual([
      0, 0.125, 0.25, 0.375, 0.625, 0.875,
    ]);
    expect(events.map(({ hitIndex }) => hitIndex)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("handles probability boundaries", () => {
    expect(
      resolveTiming(
        { cycle: [fourSteps], condition: condition({ probability: 0 }) },
        0,
      ),
    ).toEqual([]);
    expect(
      resolveTiming(
        { cycle: [fourSteps], condition: condition({ probability: 1 }) },
        0,
      ),
    ).toHaveLength(4);
  });

  it("returns no events for an empty bar", () => {
    expect(resolveTiming({ cycle: [[], fourSteps] }, 0)).toEqual([]);
  });

  it("preserves durations longer than one bar", () => {
    expect(resolveTiming({ cycle: [[{ offset: 0, duration: 4 }]] }, 0)).toEqual(
      [{ hitIndex: 0, offset: 0, duration: 4 }],
    );
  });

  it("reverses chance decisions without reversing candidate geometry", () => {
    const forward = resolveTiming(
      { cycle: [eightSteps], condition: condition() },
      0,
    );
    const reverse = resolveTiming(
      {
        cycle: [eightSteps],
        condition: condition({ order: "reverse" }),
      },
      0,
    );

    expect(forward.map(({ offset }) => offset)).toEqual([
      0, 0.125, 0.25, 0.375, 0.625, 0.875,
    ]);
    expect(reverse.map(({ offset }) => offset)).toEqual([
      0, 0.25, 0.5, 0.625, 0.75, 0.875,
    ]);
  });
});
