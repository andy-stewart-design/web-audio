import { describe, expect, it } from "vitest";
import Drome from "@/index";

// C major: [0, 2, 4, 5, 7, 9, 11] → MIDI 60, 62, 64, 65, 67, 69, 71
const C_MAJ_MIDI = [60, 62, 64, 65, 67, 69, 71];

// C minor: [0, 2, 3, 5, 7, 8, 10] → MIDI 60, 62, 63, 65, 67, 68, 70
const C_MIN_MIDI = [60, 62, 63, 65, 67, 68, 70];

function getNotes(d: Drome) {
  return d.getSchema().instruments[0].notes;
}

describe(".scale().notes(d.rand()) schema contract", () => {
  it("builds a valueMap from all scale degrees and clears range", () => {
    const d = new Drome();
    d.synth("sine").root("c4").scale("maj").notes(d.rand()).push();
    const notes = getNotes(d);

    expect(notes.type).toBe("random");
    if (notes.type !== "random") return;

    expect(notes.valueMap).toEqual(C_MAJ_MIDI);
    expect(notes.range).toBeUndefined();
  });

  it("preserves the ribbon seed alongside the valueMap", () => {
    const d = new Drome();
    d.synth("sine").root("c4").scale("min").notes(d.rand().ribbon(42)).push();
    const notes = getNotes(d);

    expect(notes.type).toBe("random");
    if (notes.type !== "random") return;

    expect(notes.valueMap).toEqual(C_MIN_MIDI);
    expect(notes.segments[0].seed).toBe(42);
  });

  it("range(0, 14) builds a two-octave valueMap", () => {
    const d = new Drome();
    d.synth("sine").root("c4").scale("maj").notes(d.rand().range(0, 14)).push();
    const notes = getNotes(d);

    expect(notes.type).toBe("random");
    if (notes.type !== "random") return;

    expect(notes.valueMap).toHaveLength(14);
    // First entry: C4 (degree 0), last entry: B5 (degree 13)
    expect(notes.valueMap![0]).toBe(60);
    expect(notes.valueMap![13]).toBe(83);
    expect(notes.range).toBeUndefined();
  });

  it("range(-7, 7) builds a valueMap starting one octave below the root", () => {
    const d = new Drome();
    d.synth("sine").root("c4").scale("maj").notes(d.rand().range(-7, 7)).push();
    const notes = getNotes(d);

    expect(notes.type).toBe("random");
    if (notes.type !== "random") return;

    expect(notes.valueMap).toHaveLength(14);
    // First entry: C3 (degree -7), crossing through C4 (degree 0) to B4 (degree 6)
    expect(notes.valueMap![0]).toBe(48); // C3
    expect(notes.valueMap![7]).toBe(60); // C4
  });

  it("without a scale, range is passed through unchanged and no valueMap is set", () => {
    const d = new Drome();
    d.synth("sine").notes(d.rand().range(60, 72)).push();
    const notes = getNotes(d);

    expect(notes.type).toBe("random");
    if (notes.type !== "random") return;

    expect(notes.valueMap).toBeUndefined();
    expect(notes.range).toEqual({ min: 60, max: 72 });
  });
});
