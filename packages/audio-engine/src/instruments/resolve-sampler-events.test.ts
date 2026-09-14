import type { SamplerEventPattern } from "@web-audio/schema";
import { describe, expect, it } from "vitest";
import { resolveSamplerEvents } from "./resolve-sampler-events";

function events(
  overrides: Partial<SamplerEventPattern> = {},
): SamplerEventPattern {
  return {
    timing: { cycle: [[{ offset: 0, duration: 1 }]] },
    sampleNames: { type: "static", cycle: [[["bd"]]] },
    ...overrides,
  };
}

describe("resolveSamplerEvents", () => {
  it("uses natural pitch and variation zero as absence defaults", () => {
    expect(resolveSamplerEvents(events(), 0)).toEqual([
      {
        hitIndex: 0,
        offset: 0,
        duration: 1,
        voices: [{ sampleName: "bd", requestedVariationIndex: 0 }],
      },
    ]);
  });

  it("resolves explicit static notes, names, and variations", () => {
    expect(
      resolveSamplerEvents(
        events({
          notes: { type: "static", cycle: [[[0, 64]]] },
          sampleNames: { type: "static", cycle: [[["bd", "sd"]]] },
          variationIndices: { type: "static", cycle: [[[2, 3]]] },
        }),
        0,
      )[0].voices,
    ).toEqual([
      { note: 0, sampleName: "bd", requestedVariationIndex: 2 },
      { note: 64, sampleName: "sd", requestedVariationIndex: 3 },
    ]);
  });

  it.each([
    {
      label: "notes",
      notes: [60, 64, 67],
      names: ["bd"],
      variations: [1, 2],
      expected: [
        { note: 60, sampleName: "bd", requestedVariationIndex: 1 },
        { note: 64, sampleName: "bd", requestedVariationIndex: 2 },
        { note: 67, sampleName: "bd", requestedVariationIndex: 1 },
      ],
    },
    {
      label: "names",
      notes: [60, 64],
      names: ["bd", "sd", "hh"],
      variations: [1],
      expected: [
        { note: 60, sampleName: "bd", requestedVariationIndex: 1 },
        { note: 64, sampleName: "sd", requestedVariationIndex: 1 },
        { note: 60, sampleName: "hh", requestedVariationIndex: 1 },
      ],
    },
    {
      label: "variations",
      notes: [60],
      names: ["bd", "sd"],
      variations: [1, 2, 3],
      expected: [
        { note: 60, sampleName: "bd", requestedVariationIndex: 1 },
        { note: 60, sampleName: "sd", requestedVariationIndex: 2 },
        { note: 60, sampleName: "bd", requestedVariationIndex: 3 },
      ],
    },
  ])(
    "uses $label as the longest voice dimension and wraps shorter groups",
    ({ notes, names, variations, expected }) => {
      const resolved = resolveSamplerEvents(
        events({
          notes: { type: "static", cycle: [[notes]] },
          sampleNames: { type: "static", cycle: [[names]] },
          variationIndices: { type: "static", cycle: [[variations]] },
        }),
        0,
      );

      expect(resolved[0].voices).toEqual(expected);
    },
  );

  it("normalizes random notes and variations to scalar groups", () => {
    const random = {
      type: "random-number" as const,
      valuesPerBar: [1],
      dataType: "integer" as const,
      segments: [{ seed: 42 }],
      range: { min: 0, max: 8 },
      algorithm: "xor" as const,
      order: "forward" as const,
    };
    const resolved = resolveSamplerEvents(
      events({
        notes: random,
        sampleNames: { type: "static", cycle: [[["bd", "sd"]]] },
        variationIndices: random,
      }),
      0,
    );

    expect(resolved[0].voices).toHaveLength(2);
    expect(resolved[0].voices[0].note).toBe(resolved[0].voices[1].note);
    expect(resolved[0].voices[0].requestedVariationIndex).toBe(
      resolved[0].voices[1].requestedVariationIndex,
    );
  });

  it("wraps every lane independently across bars and hits", () => {
    const resolved = resolveSamplerEvents(
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
        notes: { type: "static", cycle: [[[48]], [[60]], [[72]]] },
        sampleNames: { type: "static", cycle: [[["bd"]], [["sd"]]] },
        variationIndices: { type: "static", cycle: [[[1], [2], [3]]] },
      }),
      3,
    );

    expect(resolved.map(({ voices }) => voices)).toEqual([
      [{ note: 48, sampleName: "sd", requestedVariationIndex: 1 }],
      [{ note: 48, sampleName: "sd", requestedVariationIndex: 2 }],
    ]);
  });

  it("returns no values for an empty timing bar", () => {
    expect(
      resolveSamplerEvents(events({ timing: { cycle: [[]] } }), 0),
    ).toEqual([]);
  });
});
