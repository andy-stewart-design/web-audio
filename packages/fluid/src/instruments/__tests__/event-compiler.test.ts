import { RandomCycle } from "@web-audio/patterns";
import { describe, expect, it } from "vitest";
import AuthoredPitches from "@/patterns/authored-pitches";
import AuthoredTiming from "@/patterns/authored-timing";
import AuthoredEventValues from "@/patterns/authored-event-values";
import {
  compileSamplerEvents,
  compileVariationPattern,
  finalizeSamplerEvents,
} from "../event-compiler";

function compileWithTiming(pitches: AuthoredPitches, timing: AuthoredTiming) {
  return pitches.getEventPattern(timing.getTimingPattern());
}

describe("event compiler", () => {
  it("compiles the default synth note and timing", () => {
    expect(new AuthoredPitches([60]).getEventPattern()).toEqual({
      timing: { cycle: [[{ offset: 0, duration: 1 }]] },
      notes: { type: "static", cycle: [[[60]]] },
    });
  });

  it("groups chord voices, filters rests, and preserves note zero", () => {
    expect(
      new AuthoredPitches([60])
        .notes([60, [64, 67], null, 0])
        .getEventPattern(),
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
      compileWithTiming(
        new AuthoredPitches([60]).notes([60, 64]),
        new AuthoredTiming().xox([1, 0, 1, 1]),
      ),
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
    const events = new AuthoredPitches([60])
      .notes(new RandomCycle().steps(2, 0, 3).int().range(48, 72))
      .getEventPattern();

    expect(events.notes).toMatchObject({
      type: "random-number",
      valuesPerBar: [2, 0, 3],
      dataType: "integer",
      range: { min: 48, max: 72 },
    });
    expect(events.timing.cycle.map((bar) => bar.length)).toEqual([2, 0, 3]);
    expect(events.timing.condition).toBeUndefined();
  });

  it("compiles random note values with fixed timing", () => {
    const events = compileWithTiming(
      new AuthoredPitches([60]).notes(new RandomCycle().steps(2).range(48, 72)),
      new AuthoredTiming().xox([1, 0, 1, 1]),
    );

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
    const events = compileWithTiming(
      new AuthoredPitches([60]).notes([60, 64]),
      new AuthoredTiming().setRandomXox(
        new RandomCycle().bin().steps(4).chance(0.25).ribbon(7, 8),
      ),
    );

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
      compileWithTiming(
        new AuthoredPitches([60]).notes([60, 64]),
        new AuthoredTiming().setRandomXox(
          new RandomCycle().bin().steps(4, 2).chance(0),
        ),
      ),
    ).toEqual({
      timing: { cycle: [[], []] },
      notes: { type: "static", cycle: [[null], [null]] },
    });
  });

  it("applies root and scale to values without changing timing", () => {
    const events = new AuthoredPitches([60])
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
    const euclidean = compileWithTiming(
      new AuthoredPitches([60]).notes([60, 64]),
      new AuthoredTiming().euclid(2, 4),
    );
    const hexadecimal = compileWithTiming(
      new AuthoredPitches([60]).notes([60, 64]),
      new AuthoredTiming().hex("a"),
    );
    const sequence = compileWithTiming(
      new AuthoredPitches([60]).notes([60, 64]),
      new AuthoredTiming().sequence(4, 0, 2),
    );

    expect(euclidean.timing.cycle[0]).toEqual([
      { offset: 0, duration: 0.25 },
      { offset: 0.5, duration: 0.25 },
    ]);
    expect(hexadecimal.timing.cycle[0]).toEqual([
      { offset: 0, duration: 0.25 },
      { offset: 0.5, duration: 0.25 },
    ]);
    expect(sequence.timing.cycle).toEqual([
      [{ offset: 0, duration: 0.25 }],
      [{ offset: 0.5, duration: 0.25 }],
    ]);
  });

  it("keeps multi-bar silence explicit and aligned", () => {
    expect(
      new AuthoredPitches([60]).notes([60], [null], [67]).getEventPattern(),
    ).toEqual({
      timing: {
        cycle: [[{ offset: 0, duration: 1 }], [], [{ offset: 0, duration: 1 }]],
      },
      notes: { type: "static", cycle: [[[60]], [null], [[67]]] },
    });
  });

  it("does not fill default note values into a silent timing bar", () => {
    expect(
      finalizeSamplerEvents({
        timing: { cycle: [[{ offset: 0, duration: 1 }], []] },
        sampleNames: { type: "static", cycle: [[["bd"]]] },
        notes: { type: "static", cycle: [[[0]], [null]] },
      }),
    ).toEqual({
      timing: { cycle: [[{ offset: 0, duration: 1 }], []] },
      sampleNames: { type: "static", cycle: [[["bd"]], [["bd"]]] },
      notes: { type: "static", cycle: [[[0]], [null]] },
      variationIndices: undefined,
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
      compileVariationPattern(AuthoredEventValues.fromDefault<number>(0)),
    ).toBeUndefined();
    expect(
      compileVariationPattern(AuthoredEventValues.fromInput<number>([0])),
    ).toEqual({ type: "static", cycle: [[[0]]] });
    expect(
      compileVariationPattern(
        AuthoredEventValues.fromInput<number>([[0, 1, 2]]),
      ),
    ).toEqual({
      type: "static",
      cycle: [[[0], [1], [2]]],
    });
    expect(
      compileVariationPattern(
        AuthoredEventValues.fromInput<number>([
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

  it("rejects static event combinations beyond the shared bar limit", () => {
    const pitches = new AuthoredPitches([0]).notes(
      ...Array.from({ length: 32 }, () => 60),
    );
    const variation = AuthoredEventValues.fromInput<number>(
      Array.from({ length: 33 }, () => 0),
    );

    expect(() =>
      compileSamplerEvents({
        pitches,
        timing: new AuthoredTiming(),
        variation,
        sampleNames: AuthoredEventValues.fromDefault("bd"),
      }),
    ).toThrow("[Pattern] Transform produces more than 1024 bars.");
  });

  it("rejects empty notes setter input", () => {
    expect(() => new AuthoredPitches([60]).notes()).toThrow(
      "[Instrument] notes() requires at least one pattern.",
    );
  });
});
