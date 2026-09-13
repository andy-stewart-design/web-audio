import { RandomCycle } from "@web-audio/patterns";
import { describe, expect, it } from "vitest";
import SampleNotes from "./sample-notes";

describe("SampleNotes static values", () => {
  it("defaults root and note to zero without treating zero as a rest", () => {
    expect(new SampleNotes([0]).getEvents()).toEqual({
      timing: { cycle: [[{ offset: 0, duration: 1 }]] },
      notes: { type: "static", cycle: [[[0]]] },
    });
  });

  it("applies chromatic roots to static values", () => {
    expect(new SampleNotes([0]).root("A3").getSchema()).toEqual({
      type: "static",
      cycle: [[[57]]],
    });
    expect(new SampleNotes([0]).root("A3").notes([12]).getSchema()).toEqual({
      type: "static",
      cycle: [[[69]]],
    });
  });

  it("resolves static scale degrees while preserving grouped hits", () => {
    expect(
      new SampleNotes([0])
        .root("A3")
        .scale("min")
        .notes([0, 2, 4, 6])
        .getSchema(),
    ).toEqual({
      type: "static",
      cycle: [[[57], [60], [64], [67]]],
    });
  });
});

describe("SampleNotes random values", () => {
  it("emits target MIDI value-map entries in scale mode", () => {
    expect(
      new SampleNotes([0])
        .root("C4")
        .scale("maj")
        .notes(new RandomCycle())
        .getSchema(),
    ).toMatchObject({
      type: "random-number",
      valueMap: [60, 62, 64, 65, 67, 69, 71],
      range: undefined,
    });
  });

  it("preserves random ranges without a scale", () => {
    expect(
      new SampleNotes([0]).notes(new RandomCycle().range(45, 57)).getSchema(),
    ).toMatchObject({
      type: "random-number",
      valueMap: undefined,
      range: { min: 45, max: 57 },
    });
  });
});
