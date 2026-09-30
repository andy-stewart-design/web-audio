import { RandomCycle } from "@web-audio/patterns";
import { describe, expect, it } from "vitest";
import AuthoredPitches from "./authored-pitches";

const C_MAJ_MIDI = [60, 62, 64, 65, 67, 69, 71];
const C_MIN_MIDI = [60, 62, 63, 65, 67, 68, 70];

describe("authored pitch compilation", () => {
  it("preserves a default pitch of zero", () => {
    expect(new AuthoredPitches([0]).getEventPattern()).toEqual({
      timing: { cycle: [[{ offset: 0, duration: 1 }]] },
      notes: { type: "static", cycle: [[[0]]] },
    });
  });

  it("requires a nonempty default pitch fallback group", () => {
    expect(() => new AuthoredPitches([])).toThrow("nonempty fallback");
    expect(() => new AuthoredPitches([null])).toThrow("nonempty fallback");
  });

  it("exposes default pitch fallback separately from transformed timing", () => {
    const pitches = new AuthoredPitches([0, 7]).slow(2);
    expect(pitches.defaultFallback).toEqual([0, 7]);
    expect(pitches.getEventPattern().timing.cycle).toEqual([
      [{ offset: 0, duration: 1 }],
      [],
    ]);
    pitches.notes([0, 7]);
    expect(pitches.defaultFallback).toBeUndefined();
  });

  it("fills externally timed hits from a transformed default chord without creating silent-bar hits", () => {
    const pitches = new AuthoredPitches([0, 7]).root("a3").slow(2);
    const timing = {
      cycle: [
        [
          { offset: 0, duration: 0.5 },
          { offset: 0.5, duration: 0.5 },
        ],
        [],
        [{ offset: 0, duration: 1 }],
      ],
    };
    expect(pitches.getEventPattern(timing)).toEqual({
      timing: {
        cycle: [...timing.cycle, ...timing.cycle],
        condition: undefined,
      },
      notes: {
        type: "static",
        cycle: [
          [
            [57, 64],
            [57, 64],
          ],
          [null],
          [[57, 64]],
          [
            [57, 64],
            [57, 64],
          ],
          [null],
          [[57, 64]],
        ],
      },
    });
  });

  it("derives pitch output requests from authored values and transforms", () => {
    const defaultPitches = new AuthoredPitches([0]);
    const transformedPitches = new AuthoredPitches([0]).root("c4");
    const authoredPitches = new AuthoredPitches([0]).notes(60);

    expect(defaultPitches.hasAuthoredValues).toBe(false);
    expect(defaultPitches.hasRequestedPitches).toBe(false);
    expect(transformedPitches.hasAuthoredValues).toBe(false);
    expect(transformedPitches.hasRequestedPitches).toBe(true);
    expect(authoredPitches.hasAuthoredValues).toBe(true);
    expect(authoredPitches.hasRequestedPitches).toBe(true);
  });

  describe("random values", () => {
    it("builds a value map from all scale degrees and clears range", () => {
      const events = new AuthoredPitches([60])
        .root("c4")
        .scale("maj")
        .notes(new RandomCycle())
        .getEventPattern();

      expect(events.notes).toMatchObject({
        type: "random-number",
        valueMap: C_MAJ_MIDI,
        range: undefined,
      });
      expect(events.timing.cycle).toEqual([[{ offset: 0, duration: 1 }]]);
    });

    it("preserves ribbon seeds alongside scale value maps", () => {
      const notes = new AuthoredPitches([60])
        .root("c4")
        .scale("min")
        .notes(new RandomCycle().ribbon(42))
        .getSchema();

      expect(notes).toMatchObject({
        type: "random-number",
        valueMap: C_MIN_MIDI,
        segments: [{ seed: 42 }],
      });
    });

    it("uses random ranges to build multi-octave scale maps", () => {
      const positive = new AuthoredPitches([60])
        .root("c4")
        .scale("maj")
        .notes(new RandomCycle().range(0, 14))
        .getSchema();
      const negative = new AuthoredPitches([60])
        .root("c4")
        .scale("maj")
        .notes(new RandomCycle().range(-7, 7))
        .getSchema();

      expect(positive.type).toBe("random-number");
      expect(negative.type).toBe("random-number");
      if (
        positive.type !== "random-number" ||
        negative.type !== "random-number"
      ) {
        throw new Error("Expected random note patterns");
      }
      expect(positive.valueMap).toHaveLength(14);
      expect(positive.valueMap?.[0]).toBe(60);
      expect(positive.valueMap?.[13]).toBe(83);
      expect(positive.range).toBeUndefined();
      expect(negative.valueMap).toHaveLength(14);
      expect(negative.valueMap?.[0]).toBe(48);
      expect(negative.valueMap?.[7]).toBe(60);
    });

    it("preserves ranges when no scale is configured", () => {
      expect(
        new AuthoredPitches([60])
          .notes(new RandomCycle().range(60, 72))
          .getSchema(),
      ).toMatchObject({
        type: "random-number",
        valueMap: undefined,
        range: { min: 60, max: 72 },
      });
    });

    it("maps binary random notes to chromatic root offsets", () => {
      expect(
        new AuthoredPitches([60])
          .root("a3")
          .notes(new RandomCycle().bin().steps(4))
          .getSchema(),
      ).toMatchObject({
        type: "random-number",
        valueMap: [57, 58],
        range: undefined,
      });
    });

    it("maps binary random notes to the first two scale degrees", () => {
      expect(
        new AuthoredPitches([60])
          .root("a3")
          .scale("min")
          .notes(new RandomCycle().bin().steps(4))
          .getSchema(),
      ).toMatchObject({
        type: "random-number",
        valueMap: [57, 59],
        range: undefined,
      });
    });
  });
});
