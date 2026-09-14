import type { SynthEventPattern } from "@web-audio/schema";
import { describe, expect, it } from "vitest";
import { resolveSynthEvents } from "./resolve-synth-events";

function events(overrides: Partial<SynthEventPattern> = {}): SynthEventPattern {
  return {
    timing: { cycle: [[{ offset: 0, duration: 1 }]] },
    notes: { type: "static", cycle: [[[60]]] },
    ...overrides,
  };
}

describe("resolveSynthEvents", () => {
  it("resolves static scalar groups and chords", () => {
    expect(
      resolveSynthEvents(
        events({
          timing: {
            cycle: [
              [
                { offset: 0, duration: 0.5 },
                { offset: 0.5, duration: 0.5 },
              ],
            ],
          },
          notes: { type: "static", cycle: [[[0], [64, 67]]] },
        }),
        0,
      ),
    ).toEqual([
      { hitIndex: 0, offset: 0, duration: 0.5, notes: [0] },
      { hitIndex: 1, offset: 0.5, duration: 0.5, notes: [64, 67] },
    ]);
  });

  it("normalizes each random note to a one-note group", () => {
    const resolved = resolveSynthEvents(
      events({
        timing: {
          cycle: [
            [
              { offset: 0, duration: 0.5 },
              { offset: 0.5, duration: 0.5 },
            ],
          ],
        },
        notes: {
          type: "random-number",
          valuesPerBar: [2],
          dataType: "integer",
          segments: [{ seed: 42 }],
          range: { min: 0, max: 72 },
          algorithm: "xor",
          order: "forward",
        },
      }),
      0,
    );

    expect(resolved).toHaveLength(2);
    expect(resolved.every(({ notes }) => notes.length === 1)).toBe(true);
    expect(resolved.every(({ notes }) => Number.isFinite(notes[0]))).toBe(true);
  });

  it("resolves values only for surviving chance hits", () => {
    const resolved = resolveSynthEvents(
      events({
        timing: {
          cycle: [
            Array.from({ length: 8 }, (_, index) => ({
              offset: index / 8,
              duration: 0.125,
            })),
          ],
          condition: {
            type: "chance",
            probability: 0.5,
            segments: [{ seed: 42 }],
            algorithm: "xor",
            order: "forward",
          },
        },
        notes: { type: "static", cycle: [[[60], [61], [62]]] },
      }),
      0,
    );

    expect(resolved.map(({ hitIndex }) => hitIndex)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
    expect(resolved.map(({ notes }) => notes)).toEqual([
      [60],
      [61],
      [62],
      [60],
      [61],
      [62],
    ]);
  });

  it("wraps timing and note bars independently", () => {
    const resolved = resolveSynthEvents(
      events({
        timing: {
          cycle: [
            [{ offset: 0, duration: 1 }],
            [
              { offset: 0, duration: 0.5 },
              { offset: 0.5, duration: 0.5 },
            ],
          ],
        },
        notes: { type: "static", cycle: [[[48]], [[60], [64]], [[72]]] },
      }),
      3,
    );

    expect(resolved.map(({ notes }) => notes)).toEqual([[48], [48]]);
  });

  it("returns no events for an empty timing bar", () => {
    expect(
      resolveSynthEvents(events({ timing: { cycle: [[], []] } }), 1),
    ).toEqual([]);
  });
});
