import { RandomCycle } from "@web-audio/patterns";
import { describe, expect, it } from "vitest";
import MidiNotes from "@/patterns/midi-notes";
import {
  createDefaultAuthoredEventValues,
  createAuthoredEventValues,
} from "@/patterns/authored-event-values";
import {
  finalizeSamplerEvents,
  compileVariationPattern,
} from "./event-compiler";

describe("event compiler", () => {
  it("compiles the default synth note and timing", () => {
    expect(new MidiNotes([60]).getEventPattern()).toEqual({
      timing: { cycle: [[{ offset: 0, duration: 1 }]] },
      notes: { type: "static", cycle: [[[60]]] },
    });
  });

  it("groups chord voices, filters rests, and preserves note zero", () => {
    expect(
      new MidiNotes([60]).notes([60, [64, 67], null, 0]).getEventPattern(),
    ).toEqual({
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.25 },
            { offset: 0.25, duration: 0.25 },
            { offset: 0.75, duration: 0.25 },
          ],
        ],
      },
      notes: { type: "static", cycle: [[[60], [64, 67], [0]]] },
    });
  });

  it("compiles fixed XOX masks as timing rather than values", () => {
    expect(
      new MidiNotes([60]).notes([60, 64]).xox([1, 0, 1, 1]).getEventPattern(),
    ).toEqual({
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.25 },
            { offset: 0.5, duration: 0.25 },
            { offset: 0.75, duration: 0.25 },
          ],
        ],
      },
      notes: { type: "static", cycle: [[[60], [64], [60]]] },
    });
  });

  it("compiles random notes as values independently from their timing", () => {
    const events = new MidiNotes([60])
      .notes(new RandomCycle().steps(2, 0, 3).int().range(48, 72))
      .getEventPattern();

    expect(events.notes).toMatchObject({
      type: "random-number",
      valuesPerBar: [2, 0, 3],
      dataType: "integer",
      range: { min: 48, max: 72 },
    });
    expect(events.timing.cycle.map((bar) => bar.length)).toEqual([2, 0, 3]);
    expect(events.timing).not.toHaveProperty("condition");
  });

  it("compiles random note values with fixed timing", () => {
    const events = new MidiNotes([60])
      .notes(new RandomCycle().steps(2).range(48, 72))
      .xox([1, 0, 1, 1])
      .getEventPattern();

    expect(events.notes).toMatchObject({
      type: "random-number",
      valuesPerBar: [3],
      range: { min: 48, max: 72 },
    });
    expect(events.timing).toEqual({
      cycle: [
        [
          { offset: 0, duration: 0.25 },
          { offset: 0.5, duration: 0.25 },
          { offset: 0.75, duration: 0.25 },
        ],
      ],
    });
  });

  it("compiles random XOX as candidate timing with one chance condition", () => {
    const events = new MidiNotes([60])
      .notes([60, 64])
      .xox(new RandomCycle().bin().steps(4).chance(0.25).ribbon(7, 8))
      .getEventPattern();

    expect(events.timing.cycle[0]).toEqual([
      { offset: 0, duration: 0.25 },
      { offset: 0.25, duration: 0.25 },
      { offset: 0.5, duration: 0.25 },
      { offset: 0.75, duration: 0.25 },
    ]);
    expect(events.timing.condition).toEqual({
      type: "chance",
      probability: 0.25,
      segments: [{ seed: 7, len: 8 }],
      algorithm: "xor",
      order: "forward",
    });
    expect(events.notes).toEqual({
      type: "static",
      cycle: [[[60], [64], [60], [64]]],
    });
  });

  it("compiles probability zero as aligned silent bars", () => {
    expect(
      new MidiNotes([60])
        .notes([60, 64])
        .xox(new RandomCycle().bin().steps(4, 2).chance(0))
        .getEventPattern(),
    ).toEqual({
      timing: { cycle: [[], []] },
      notes: { type: "static", cycle: [[null], [null]] },
    });
  });

  it("applies root and scale to values without changing timing", () => {
    const events = new MidiNotes([60])
      .root("c4")
      .scale("maj")
      .notes([0, 1])
      .getEventPattern();

    expect(events.notes).toEqual({
      type: "static",
      cycle: [[[60], [62]]],
    });
    expect(events.timing).toEqual({
      cycle: [
        [
          { offset: 0, duration: 0.5 },
          { offset: 0.5, duration: 0.5 },
        ],
      ],
    });
  });

  it("preserves Euclidean, hex, and sequence composition", () => {
    const euclidean = new MidiNotes([60]).notes([60, 64]).euclid(2, 4);
    const hexadecimal = new MidiNotes([60]).notes([60, 64]).hex("a");
    const sequence = new MidiNotes([60]).notes([60, 64]).sequence(4, 0, 2);

    expect(euclidean.getEventPattern().timing.cycle[0]).toEqual([
      { offset: 0, duration: 0.25 },
      { offset: 0.5, duration: 0.25 },
    ]);
    expect(hexadecimal.getEventPattern().timing.cycle[0]).toEqual([
      { offset: 0, duration: 0.25 },
      { offset: 0.5, duration: 0.25 },
    ]);
    expect(sequence.getEventPattern().timing.cycle).toEqual([
      [{ offset: 0, duration: 0.25 }],
      [{ offset: 0.5, duration: 0.25 }],
    ]);
  });

  it("keeps multi-bar silence explicit and aligned", () => {
    expect(
      new MidiNotes([60]).notes([60], [null], [67]).getEventPattern(),
    ).toEqual({
      timing: {
        cycle: [[{ offset: 0, duration: 1 }], [], [{ offset: 0, duration: 1 }]],
      },
      notes: { type: "static", cycle: [[[60]], [null], [[67]]] },
    });
  });

  it("aligns zero-count event values with empty timing bars", () => {
    expect(
      finalizeSamplerEvents({
        timing: { cycle: [[{ offset: 0, duration: 1 }]] },
        sampleNames: { type: "static", cycle: [[["kick"]]] },
        variationIndices: new RandomCycle().steps(2, 0).int().getRandomSchema(),
      }),
    ).toMatchObject({
      timing: { cycle: [[{ offset: 0, duration: 1 }], []] },
      variationIndices: { valuesPerBar: [2, 0] },
    });
  });

  it("serializes normalized variation lanes", () => {
    expect(
      compileVariationPattern(createDefaultAuthoredEventValues(0)),
    ).toBeUndefined();
    expect(
      compileVariationPattern(createAuthoredEventValues<number>([0])),
    ).toBeUndefined();
    expect(
      compileVariationPattern(createAuthoredEventValues([[0, 1, 2]])),
    ).toEqual({
      type: "static",
      cycle: [[[0], [1], [2]]],
    });
    expect(
      compileVariationPattern(
        createAuthoredEventValues<number>([
          new RandomCycle().steps(2).int().range(0, 4),
        ]),
      ),
    ).toMatchObject({
      type: "random-number",
      valuesPerBar: [2],
      dataType: "integer",
      range: { min: 0, max: 4 },
    });
  });

  it("rejects empty notes setter input", () => {
    expect(() => new MidiNotes([60]).notes()).toThrow(
      "[Instrument] notes() requires at least one pattern.",
    );
  });

  it("rejects non-binary random rhythm patterns", () => {
    expect(() =>
      new MidiNotes([60]).xox(new RandomCycle()).getEventPattern(),
    ).toThrow("Instrument.xox() random masks must be binary");
  });
});
