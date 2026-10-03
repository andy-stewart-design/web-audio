import type { SamplerEventPattern } from "@web-audio/schema";
import { describe, expect, it } from "vitest";
import { resolveSamplerEvents } from "./resolve-sampler-events";
import RandomResolver from "@/resolvers/random-resolver";

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

  it("resolves name-only sequencing with natural pitch and variation zero", () => {
    expect(
      resolveSamplerEvents(
        events({
          timing: {
            cycle: [
              [
                { offset: 0, duration: 1 / 3 },
                { offset: 1 / 3, duration: 1 / 3 },
                { offset: 2 / 3, duration: 1 / 3 },
              ],
            ],
          },
          sampleNames: {
            type: "static",
            cycle: [[["bd"], ["sd"], ["hh"]]],
          },
        }),
        0,
      ).map(({ voices }) => voices),
    ).toEqual([
      [{ sampleName: "bd", requestedVariationIndex: 0 }],
      [{ sampleName: "sd", requestedVariationIndex: 0 }],
      [{ sampleName: "hh", requestedVariationIndex: 0 }],
    ]);
  });

  it("broadcasts one note and variation across duplicate layered names", () => {
    expect(
      resolveSamplerEvents(
        events({
          notes: { type: "static", cycle: [[[60]]] },
          sampleNames: { type: "static", cycle: [[["bd", "bd", "sd"]]] },
          variationIndices: { type: "static", cycle: [[[2]]] },
        }),
        0,
      )[0].voices,
    ).toEqual([
      { note: 60, sampleName: "bd", requestedVariationIndex: 2 },
      { note: 60, sampleName: "bd", requestedVariationIndex: 2 },
      { note: 60, sampleName: "sd", requestedVariationIndex: 2 },
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

  it.each([
    {
      label: "one note with three variations",
      notes: [60],
      variations: [0, 1, 2],
      expected: [
        { note: 60, sampleName: "bd", requestedVariationIndex: 0 },
        { note: 60, sampleName: "bd", requestedVariationIndex: 1 },
        { note: 60, sampleName: "bd", requestedVariationIndex: 2 },
      ],
    },
    {
      label: "three notes with one variation",
      notes: [60, 64, 67],
      variations: [1],
      expected: [
        { note: 60, sampleName: "bd", requestedVariationIndex: 1 },
        { note: 64, sampleName: "bd", requestedVariationIndex: 1 },
        { note: 67, sampleName: "bd", requestedVariationIndex: 1 },
      ],
    },
    {
      label: "two notes with three variations",
      notes: [60, 64],
      variations: [0, 1, 2],
      expected: [
        { note: 60, sampleName: "bd", requestedVariationIndex: 0 },
        { note: 64, sampleName: "bd", requestedVariationIndex: 1 },
        { note: 60, sampleName: "bd", requestedVariationIndex: 2 },
      ],
    },
  ])(
    "resolves $label with longest-array wrapping",
    ({ notes, variations, expected }) => {
      expect(
        resolveSamplerEvents(
          events({
            notes: { type: "static", cycle: [[notes]] },
            variationIndices: { type: "static", cycle: [[variations]] },
          }),
          0,
        )[0].voices,
      ).toEqual(expected);
    },
  );

  it("uses one chance decision for every variation layer", () => {
    expect(
      resolveSamplerEvents(
        events({
          timing: {
            cycle: [[{ offset: 0, duration: 1 }]],
            condition: {
              type: "chance",
              probability: 0,
              segments: [{ seed: 42 }],
              algorithm: "xor",
              order: "forward",
            },
          },
          variationIndices: { type: "static", cycle: [[[0, 1, 2]]] },
        }),
        0,
      ),
    ).toEqual([]);
  });

  it("uses one chance decision for every layered name", () => {
    expect(
      resolveSamplerEvents(
        events({
          timing: {
            cycle: [[{ offset: 0, duration: 1 }]],
            condition: {
              type: "chance",
              probability: 0,
              segments: [{ seed: 42 }],
              algorithm: "xor",
              order: "forward",
            },
          },
          sampleNames: { type: "static", cycle: [[["bd", "sd"]]] },
        }),
        0,
      ),
    ).toEqual([]);
  });

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

  it("broadcasts one random variation across a static chord", () => {
    const resolved = resolveSamplerEvents(
      events({
        notes: { type: "static", cycle: [[[60, 64]]] },
        variationIndices: {
          type: "random-number",
          valuesPerBar: [1],
          dataType: "integer",
          segments: [{ seed: 42 }],
          valueMap: [2],
          algorithm: "xor",
          order: "forward",
        },
      }),
      0,
    );

    expect(resolved[0].voices).toEqual([
      { note: 60, sampleName: "bd", requestedVariationIndex: 2 },
      { note: 64, sampleName: "bd", requestedVariationIndex: 2 },
    ]);
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

  it("middle chance misses consume no random notes, variations, or sample names", () => {
    // Complete schema matched by Fluid's native compiler tests: availability
    // has already removed original candidate ordinals 1, 4, 7, and 10.
    const notes = {
      type: "random-number",
      valuesPerBar: [8],
      dataType: "integer",
      segments: [{ seed: 7 }],
      range: { min: 48, max: 72 },
      algorithm: "xor",
      order: "forward",
    } as const;
    const variationIndices = {
      ...notes,
      valuesPerBar: [3],
      segments: [{ seed: 11 }],
      range: { min: 0, max: 10 },
    };
    const pattern = events({
      timing: {
        cycle: [
          [0, 2, 3, 5, 6, 8, 9, 11].map((index) => ({
            offset: index * (1 / 12),
            duration: 1 / 12,
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
      sampleNames: { type: "static", cycle: [[["bd"], ["sd"]]] },
      notes: { ...notes, valuesPerBar: [8], segments: [{ seed: 7 }] },
      variationIndices,
    });
    const resolved = resolveSamplerEvents(pattern, 0);
    expect(resolved.map((event) => event.offset)).toEqual(
      [0, 2, 3, 5, 8, 11].map((index) => index * (1 / 12)),
    );
    expect(resolved.map((event) => event.hitIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(resolved.map((event) => event.voices[0].sampleName)).toEqual([
      "bd",
      "sd",
      "bd",
      "sd",
      "bd",
      "sd",
    ]);
    if (
      pattern.notes?.type !== "random-number" ||
      pattern.variationIndices?.type !== "random-number"
    )
      throw new Error("Expected random schemas");
    const expectedNotes = new RandomResolver(pattern.notes);
    const expectedVariations = new RandomResolver(pattern.variationIndices);
    expect(resolved.map((event) => event.voices[0].note)).toEqual(
      Array.from({ length: 6 }, (_, index) => expectedNotes.resolve(0, index)),
    );
    expect(
      resolved.map((event) => event.voices[0].requestedVariationIndex),
    ).toEqual(
      Array.from({ length: 6 }, (_, index) =>
        expectedVariations.resolve(0, index),
      ),
    );
    expect(resolved.map((event) => event.voices[0].note)).not.toEqual(
      [0, 1, 2, 3, 5, 7].map((index) => expectedNotes.resolve(0, index)),
    );
  });

  it("returns no values for an empty timing bar", () => {
    expect(
      resolveSamplerEvents(events({ timing: { cycle: [[]] } }), 0),
    ).toEqual([]);
  });
});
