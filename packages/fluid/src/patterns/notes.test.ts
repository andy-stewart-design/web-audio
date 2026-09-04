import { RandomCycle } from "@web-audio/patterns";
import { describe, expect, it } from "vitest";
import MidiNotes from "./midi-notes";

const C_MAJ_MIDI = [60, 62, 64, 65, 67, 69, 71];
const C_MIN_MIDI = [60, 62, 63, 65, 67, 68, 70];

describe("random note compilation", () => {
  it("builds a value map from all scale degrees and clears range", () => {
    const events = new MidiNotes([60])
      .root("c4")
      .scale("maj")
      .notes(new RandomCycle())
      .getEvents();

    expect(events.notes).toMatchObject({
      type: "random-number",
      valueMap: C_MAJ_MIDI,
      range: undefined,
    });
    expect(events.timing.cycle).toEqual([[{ offset: 0, duration: 1 }]]);
  });

  it("preserves ribbon seeds alongside scale value maps", () => {
    const notes = new MidiNotes([60])
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
    const positive = new MidiNotes([60])
      .root("c4")
      .scale("maj")
      .notes(new RandomCycle().range(0, 14))
      .getSchema();
    const negative = new MidiNotes([60])
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
      new MidiNotes([60]).notes(new RandomCycle().range(60, 72)).getSchema(),
    ).toMatchObject({
      type: "random-number",
      valueMap: undefined,
      range: { min: 60, max: 72 },
    });
  });

  it("maps binary random notes to chromatic root offsets", () => {
    expect(
      new MidiNotes([60])
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
      new MidiNotes([60])
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
