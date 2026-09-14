import { RandomCycle } from "@web-audio/patterns";
import { describe, expect, it } from "vitest";
import Envelope from "@/automations/envelope";
import type { EnvelopeSchema } from "@web-audio/schema";
import Sampler from "./sampler";
import Synthesizer from "./synthesizer";

function staticValue(schema: EnvelopeSchema["a"]) {
  expect(schema.type).toBe("static");
  if (schema.type !== "static") throw new Error("Expected static schema");
  return schema.cycle[0][0];
}

function expectGainADSR(
  envelope: EnvelopeSchema,
  expected: { a: number; d: number; s: number; r: number },
) {
  expect(staticValue(envelope.a)).toBe(expected.a);
  expect(staticValue(envelope.d)).toBe(expected.d);
  expect(staticValue(envelope.s)).toBe(expected.s);
  expect(staticValue(envelope.r)).toBe(expected.r);
}

describe("instrument event schemas", () => {
  it("emits the default synth as explicit timing and note values", () => {
    const schema = new Synthesizer().getSchema();

    expect(schema.eventPattern).toEqual({
      timing: { cycle: [[{ offset: 0, duration: 1 }]] },
      notes: { type: "static", cycle: [[[60]]] },
    });
    expect(schema).not.toHaveProperty("notes");
  });

  it("compiles fixed synth rhythms into canonical event timing", () => {
    const events = new Synthesizer()
      .notes([60, 64, 67, 71])
      .xox([1, 0, 1, 1, 1, 1, 0, 1])
      .getSchema().eventPattern;

    expect(events.notes).toEqual({
      type: "static",
      cycle: [[[60], [64], [67], [71], [60], [64]]],
    });
    expect(events.timing.cycle[0]).toEqual([
      { offset: 0, duration: 0.125 },
      { offset: 0.25, duration: 0.125 },
      { offset: 0.375, duration: 0.125 },
      { offset: 0.5, duration: 0.125 },
      { offset: 0.625, duration: 0.125 },
      { offset: 0.875, duration: 0.125 },
    ]);
    expect(events).not.toHaveProperty("mask");
  });

  it("replaces note and fixed-rhythm state when notes are replaced", () => {
    expect(
      new Synthesizer()
        .notes([60, 64])
        .xox([1, 0, 1])
        .notes([67, 71])
        .getSchema().eventPattern,
    ).toEqual({
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.5 },
            { offset: 0.5, duration: 0.5 },
          ],
        ],
      },
      notes: { type: "static", cycle: [[[67], [71]]] },
    });
  });

  it("serializes random XOX as one timing condition", () => {
    const events = new Synthesizer()
      .notes([60])
      .xox(new RandomCycle().chance(0.6).bin().steps(4, 0))
      .getSchema().eventPattern;

    expect(events.timing.cycle.map((bar) => bar.length)).toEqual([4, 0]);
    expect(events.timing.condition).toMatchObject({
      type: "chance",
      probability: 0.6,
    });
    expect(events.notes).toEqual({
      type: "static",
      cycle: [[[60], [60], [60], [60]], [null]],
    });
  });

  it("rejects non-binary random trigger timing", () => {
    expect(() =>
      new Synthesizer().xox(new RandomCycle().range(0, 1)).getSchema(),
    ).toThrow("Instrument.xox() random masks must be binary");
  });

  it("emits a natural-pitch sampler without notes or default variation", () => {
    const schema = new Sampler("kick").getSchema();

    expect(schema.eventPattern).toEqual({
      timing: { cycle: [[{ offset: 0, duration: 1 }]] },
      sampleNames: { type: "static", cycle: [[["kick"]]] },
    });
    expect(schema).not.toHaveProperty("sample");
    expect(schema).not.toHaveProperty("sourceKeys");
    expect(schema).not.toHaveProperty("variation");
    expect(schema).not.toHaveProperty("notes");
  });

  it("emits sampler pitch values only when pitch intent is explicit", () => {
    const root = new Sampler("kick").root("A3").getSchema().eventPattern;
    const scale = new Sampler("kick")
      .root("A3")
      .scale("min")
      .notes([0, 2, 4])
      .getSchema().eventPattern;

    expect(root.notes).toEqual({ type: "static", cycle: [[[57]]] });
    expect(root.timing).toEqual({
      cycle: [[{ offset: 0, duration: 1 }]],
    });
    expect(scale.notes).toEqual({
      type: "static",
      cycle: [[[57], [60], [64]]],
    });
    expect(scale.timing.cycle[0]).toHaveLength(3);
  });

  it("moves explicit sampler variation values under events", () => {
    expect(
      new Sampler("kick").variation([0, 1, 2]).getSchema().eventPattern,
    ).toMatchObject({
      variationIndices: {
        type: "static",
        cycle: [[[0], [1], [2]]],
      },
    });
    expect(
      new Sampler("kick")
        .variation(new RandomCycle().steps(3).int().range(0, 4))
        .getSchema().eventPattern.variationIndices,
    ).toMatchObject({
      type: "random-number",
      valuesPerBar: [3],
      dataType: "integer",
      range: { min: 0, max: 4 },
    });
  });

  it("supports variation bars, sequential hits, and simultaneous voices", () => {
    expect(
      new Sampler("kick").variation(0, 1, 2).getSchema().eventPattern,
    ).toMatchObject({
      timing: {
        cycle: [
          [{ offset: 0, duration: 1 }],
          [{ offset: 0, duration: 1 }],
          [{ offset: 0, duration: 1 }],
        ],
      },
      variationIndices: {
        type: "static",
        cycle: [[[0]], [[1]], [[2]]],
      },
    });

    expect(
      new Sampler("kick").variation([[0, 1], [2], [3, 4]]).getSchema()
        .eventPattern.variationIndices,
    ).toEqual({
      type: "static",
      cycle: [[[0, 1], [2], [3, 4]]],
    });

    expect(
      new Sampler("kick").variation(-1.5, 2.25).getSchema().eventPattern
        .variationIndices,
    ).toEqual({
      type: "static",
      cycle: [[[-1.5]], [[2.25]]],
    });
  });

  it("preserves variation rests as silent timing gaps", () => {
    expect(
      new Sampler("kick").variation([0, null, 2]).getSchema().eventPattern,
    ).toEqual({
      timing: {
        cycle: [
          [
            { offset: 0, duration: 1 / 3 },
            { offset: 2 / 3, duration: 1 / 3 },
          ],
        ],
      },
      sampleNames: { type: "static", cycle: [[["kick"]]] },
      variationIndices: { type: "static", cycle: [[[0], [2]]] },
    });

    expect(
      new Sampler("kick").variation([], [1]).getSchema().eventPattern,
    ).toMatchObject({
      timing: {
        cycle: [[], [{ offset: 0, duration: 1 }]],
      },
      variationIndices: { type: "static", cycle: [[null], [[1]]] },
    });
  });

  it("aliases var() to variation() and replaces the previous pattern", () => {
    const sampler = new Sampler("kick");
    expect(sampler.var([0, 1])).toBe(sampler);
    sampler.variation([2]);

    expect(sampler.getSchema().eventPattern.variationIndices).toEqual({
      type: "static",
      cycle: [[[2]]],
    });
  });

  it("keeps random variation scalar per hit", () => {
    expect(
      new Sampler("kick").var(new RandomCycle().int().steps(4)).getSchema()
        .eventPattern.variationIndices,
    ).toMatchObject({
      type: "random-number",
      valuesPerBar: [4],
      dataType: "integer",
    });
  });

  it("rejects invalid variation shapes and values", () => {
    expect(() => new Sampler("kick").variation()).toThrow(
      "[Sampler] variation() requires at least one pattern.",
    );
    expect(() => {
      // @ts-expect-error null is not valid inside a simultaneous voice group.
      new Sampler("kick").variation([[0, null]]);
    }).toThrow(
      "[Sampler] variation() null is only allowed as a whole-hit rest.",
    );
    expect(() => new Sampler("kick").variation([[]])).toThrow(
      "[Sampler] variation() simultaneous voice groups cannot be empty.",
    );
    expect(() => new Sampler("kick").variation(Number.NaN)).toThrow(
      "[Sampler] variation() values must be finite numbers.",
    );
  });

  it.each([
    {
      sliceCount: 1,
      expected: [[{ offset: 0, duration: 4 }], [], [], []],
    },
    {
      sliceCount: 2,
      expected: [
        [{ offset: 0, duration: 2 }],
        [],
        [{ offset: 0, duration: 2 }],
        [],
      ],
    },
    {
      sliceCount: 8,
      expected: Array.from({ length: 4 }, () => [
        { offset: 0, duration: 0.5 },
        { offset: 0.5, duration: 0.5 },
      ]),
    },
  ])(
    "preserves chop($sliceCount).fit(4) generated timing",
    ({ sliceCount, expected }) => {
      const schema = new Sampler("loop").chop(sliceCount).fit(4).getSchema();

      expect(schema.eventPattern.timing.cycle).toEqual(expected);
      expect(schema.eventPattern.notes).toBeUndefined();
    },
  );

  it("wraps explicit pitch values over authored chop timing", () => {
    const events = new Sampler("loop")
      .fit(2)
      .chop(8, [0, 3, 5, 1])
      .notes([0, 12])
      .getSchema().eventPattern;

    expect(events.timing.cycle[0]).toEqual([
      { offset: 0, duration: 0.25 },
      { offset: 0.25, duration: 0.25 },
      { offset: 0.5, duration: 0.25 },
      { offset: 0.75, duration: 0.25 },
    ]);
    expect(events.notes).toEqual({
      type: "static",
      cycle: [[[0], [12], [0], [12]]],
    });
  });
});

describe("Instrument numeric processing", () => {
  it("serializes static detune values without timing fields", () => {
    expect(new Synthesizer().detune([0, 100]).getSchema().detune).toEqual({
      type: "static",
      cycle: [[0, 100]],
    });
  });

  it("serializes random detune values with per-bar counts", () => {
    expect(
      new Sampler("kick")
        .detune(new RandomCycle().steps(2, 0).range(-100, 100))
        .getSchema().detune,
    ).toMatchObject({
      type: "random-number",
      valuesPerBar: [2, 0],
      range: { min: -100, max: 100 },
    });
  });
});

describe("Instrument gain envelopes", () => {
  it("defaults synth gain to a faster synth envelope", () => {
    const schema = new Synthesizer().getSchema();

    expectGainADSR(schema.gain, { a: 0.005, d: 0, s: 1, r: 0.005 });
  });

  it("defaults sampler gain to a sharper sample envelope", () => {
    const schema = new Sampler("kick").getSchema();

    expectGainADSR(schema.gain, { a: 0.0025, d: 0, s: 1, r: 0.005 });
  });

  it("preserves synth gain defaults when setting gain value", () => {
    const schema = new Synthesizer().gain(0.5).getSchema();

    expectGainADSR(schema.gain, { a: 0.005, d: 0, s: 1, r: 0.005 });
  });

  it("preserves sampler gain defaults when setting gain value", () => {
    const schema = new Sampler("kick").gain(0.5).getSchema();

    expectGainADSR(schema.gain, { a: 0.0025, d: 0, s: 1, r: 0.005 });
  });

  it("uses explicit gain envelopes as-is", () => {
    const env = new Envelope().adsr(0.1, 0.2, 0.3, 0.4);
    const schema = new Sampler("kick").gain(env).getSchema();

    expectGainADSR(schema.gain, { a: 0.1, d: 0.2, s: 0.3, r: 0.4 });
  });

  it("supports adsr shorthand for gain envelope", () => {
    const schema = new Synthesizer().adsr(0, 1, 0.333, 1).getSchema();

    expectGainADSR(schema.gain, { a: 0, d: 1, s: 0.333, r: 1 });
  });

  it("composes scalar gain and ADSR in either order", () => {
    const adsrThenGain = new Synthesizer()
      .adsr(0, 0, 1, 1)
      .gain(0.5)
      .getSchema().gain;
    const gainThenAdsr = new Synthesizer()
      .gain(0.5)
      .adsr(0, 0, 1, 1)
      .getSchema().gain;

    expect(adsrThenGain).toEqual(gainThenAdsr);
    expectGainADSR(adsrThenGain, { a: 0, d: 0, s: 1, r: 1 });
    expect(adsrThenGain.max.type).toBe("static");
    if (adsrThenGain.max.type === "static") {
      expect(adsrThenGain.max.cycle[0][0]).toBe(0.5);
    }
  });

  it("composes sampler gain and ADSR in either order", () => {
    const adsrThenGain = new Sampler("kick")
      .adsr(0.1, 0.2, 0.3, 0.4)
      .gain([0.5, 0.75])
      .getSchema().gain;
    const gainThenAdsr = new Sampler("kick")
      .gain([0.5, 0.75])
      .adsr(0.1, 0.2, 0.3, 0.4)
      .getSchema().gain;

    expect(adsrThenGain).toEqual(gainThenAdsr);
    expectGainADSR(adsrThenGain, { a: 0.1, d: 0.2, s: 0.3, r: 0.4 });
  });
});
