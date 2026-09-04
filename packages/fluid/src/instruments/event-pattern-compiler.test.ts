import { RandomCycle } from "@web-audio/patterns";
import { describe, expect, it } from "vitest";
import MidiNotes from "@/patterns/midi-notes";

describe("event pattern compiler", () => {
  it("compiles the default synth note and timing", () => {
    expect(new MidiNotes([60]).getEvents()).toEqual({
      timing: { cycle: [[{ offset: 0, duration: 1 }]] },
      notes: { type: "static", cycle: [[[60]]] },
    });
  });

  it("groups chord voices, filters rests, and preserves note zero", () => {
    expect(
      new MidiNotes([60]).notes([60, [64, 67], null, 0]).getEvents(),
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
      new MidiNotes([60]).notes([60, 64]).xox([1, 0, 1, 1]).getEvents(),
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
      .getEvents();

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
      .getEvents();

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
      .getEvents();

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
        .getEvents(),
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
      .getEvents();

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

    expect(euclidean.getEvents().timing.cycle[0]).toEqual([
      { offset: 0, duration: 0.25 },
      { offset: 0.5, duration: 0.25 },
    ]);
    expect(hexadecimal.getEvents().timing.cycle[0]).toEqual([
      { offset: 0, duration: 0.25 },
      { offset: 0.5, duration: 0.25 },
    ]);
    expect(sequence.getEvents().timing.cycle).toEqual([
      [{ offset: 0, duration: 0.25 }],
      [{ offset: 0.5, duration: 0.25 }],
    ]);
  });

  it("keeps multi-bar silence explicit and aligned", () => {
    expect(new MidiNotes([60]).notes([60], [null], [67]).getEvents()).toEqual({
      timing: {
        cycle: [[{ offset: 0, duration: 1 }], [], [{ offset: 0, duration: 1 }]],
      },
      notes: { type: "static", cycle: [[[60]], [null], [[67]]] },
    });
  });

  it("rejects empty notes setter input", () => {
    expect(() => new MidiNotes([60]).notes()).toThrow(
      "[Instrument] notes() requires at least one pattern.",
    );
  });

  it("rejects non-binary random rhythm patterns", () => {
    expect(() =>
      new MidiNotes([60]).xox(new RandomCycle()).getEvents(),
    ).toThrow("Instrument.xox() random masks must be binary");
  });
});
