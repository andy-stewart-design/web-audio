import { RandomCycle } from "@web-audio/patterns";
import { describe, expect, it } from "vitest";
import Sampler from "./sampler";
import Synthesizer from "./synthesizer";
import Envelope from "@/automations/envelope";
import type { EnvelopeSchema } from "@web-audio/schema";

function staticValue(schema: EnvelopeSchema["a"]) {
  expect(schema.type).toBe("static");
  if (schema.type !== "static") throw new Error("Expected static schema");
  return schema.cycle[0][0].value;
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

function getStaticMaskFixture(
  schema:
    | ReturnType<Synthesizer["getSchema"]>
    | ReturnType<Sampler["getSchema"]>,
) {
  const { source, mask } = schema.notes;
  expect(source.type).toBe("static");
  expect(mask?.type).toBe("static");
  if (source.type !== "static" || mask?.type !== "static") {
    throw new Error("Expected static source and mask schemas");
  }

  return {
    source: source.cycle.map((bar) => bar.map((step) => step.value)),
    mask: mask.cycle.map((bar) =>
      bar.map(({ offset, duration, stepIndex }) => ({
        offset,
        duration,
        stepIndex,
      })),
    ),
  };
}

describe("Instrument static xox masks", () => {
  it("keeps synth source notes separate from the trigger mask", () => {
    const schema = new Synthesizer()
      .notes([60, 64, 67, 71])
      .xox([1, 0, 1, 1, 1, 1, 0, 1])
      .getSchema();

    expect(schema.notes.source.type).toBe("static");
    if (schema.notes.source.type === "static") {
      expect(schema.notes.source.cycle[0].map((step) => step.value)).toEqual([
        60, 64, 67, 71, 60, 64,
      ]);
    }
    expect(schema.notes.mask?.type).toBe("static");
    if (schema.notes.mask?.type === "static") {
      expect(schema.notes.mask.cycle[0].map((step) => step.stepIndex)).toEqual([
        0, 2, 3, 4, 5, 7,
      ]);
    }
  });

  it("serializes all-active xox as an unmasked expanded source cycle", () => {
    const schema = new Synthesizer()
      .notes([60, 64])
      .xox([1, 1, 1, 1])
      .getSchema();

    expect(schema.notes.mask).toBeUndefined();
    expect(schema.notes.source.type).toBe("static");
    if (schema.notes.source.type === "static") {
      expect(schema.notes.source.cycle[0].map((step) => step.value)).toEqual([
        60, 64, 60, 64,
      ]);
    }
  });

  it("replaces static source content and clears its mask", () => {
    const schema = new Synthesizer()
      .notes([60, 64])
      .xox([1, 0, 1])
      .notes([67, 71])
      .getSchema();

    expect(schema.notes.mask).toBeUndefined();
    expect(schema.notes.source.type).toBe("static");
    if (schema.notes.source.type === "static") {
      expect(schema.notes.source.cycle[0].map((step) => step.value)).toEqual([
        67, 71,
      ]);
    }
  });

  it("replaces random source content and clears its mask", () => {
    const mask = new RandomCycle().bin().chance(0.5).steps(4);
    const schema = new Synthesizer()
      .notes([60, 64])
      .xox(mask)
      .notes([67, 71])
      .getSchema();

    expect(schema.notes.mask).toBeUndefined();
    expect(schema.notes.source.type).toBe("static");
    if (schema.notes.source.type === "static") {
      expect(schema.notes.source.cycle[0].map((step) => step.value)).toEqual([
        67, 71,
      ]);
    }
  });

  it("preserves static modifier order after xox", () => {
    const schema = new Synthesizer()
      .notes([60, 64])
      .xox([1, 0, 1, 1])
      .slow(2)
      .getSchema();

    expect(schema.notes.source.type).toBe("static");
    if (schema.notes.source.type === "static") {
      expect(
        schema.notes.source.cycle.map((bar) => bar.map((step) => step.value)),
      ).toEqual([[60], [64, 60]]);
    }
    expect(schema.notes.mask?.type).toBe("static");
    if (schema.notes.mask?.type === "static") {
      expect(
        schema.notes.mask.cycle.map((bar) => bar.map((step) => step.stepIndex)),
      ).toEqual([[0], [0, 2]]);
    }
  });

  it("characterizes static xox modifier ordering and timing", () => {
    const fixtures = [
      {
        name: "fast after xox",
        instrument: () =>
          new Synthesizer().notes([60, 64]).xox([1, 0, 1]).fast(2),
        expected: [
          [
            { value: 60, offset: 0, duration: 1 / 6, stepIndex: 0 },
            { value: 64, offset: 2 / 6, duration: 1 / 6, stepIndex: 2 },
            { value: 60, offset: 3 / 6, duration: 1 / 6, stepIndex: 3 },
            {
              value: 64,
              offset: (1 / 6) * 5,
              duration: 1 / 6,
              stepIndex: 5,
            },
          ],
        ],
      },
      {
        name: "reverse after xox",
        instrument: () =>
          new Synthesizer().notes([60, 64]).xox([1, 0, 1]).reverse(),
        expected: [
          [
            { value: 64, offset: 0, duration: 1 / 3, stepIndex: 0 },
            { value: 60, offset: 2 / 3, duration: 1 / 3, stepIndex: 2 },
          ],
        ],
      },
      {
        name: "stretch after xox",
        instrument: () =>
          new Synthesizer().notes([60, 64]).xox([1, 0, 1]).stretch(2, 2),
        expected: Array.from({ length: 2 }, () => [
          { value: 60, offset: 0, duration: 1 / 6, stepIndex: 0 },
          { value: 60, offset: 1 / 6, duration: 1 / 6, stepIndex: 1 },
          { value: 64, offset: 4 / 6, duration: 1 / 6, stepIndex: 4 },
          {
            value: 64,
            offset: (1 / 6) * 5,
            duration: 1 / 6,
            stepIndex: 5,
          },
        ]),
      },
      {
        name: "euclid before xox",
        instrument: () =>
          new Synthesizer().notes([60, 64]).euclid(2, 4).xox([1, 0, 1, 1]),
        expected: [
          [
            { value: 60, offset: 0, duration: 1 / 4, stepIndex: 0 },
            { value: 64, offset: 3 / 4, duration: 1 / 4, stepIndex: 3 },
          ],
        ],
      },
      {
        name: "xox before euclid",
        instrument: () =>
          new Synthesizer().notes([60, 64]).xox([1, 0, 1, 1]).euclid(2, 4),
        expected: [[{ value: 60, offset: 0, duration: 1 / 4, stepIndex: 0 }]],
      },
      {
        name: "hex after xox",
        instrument: () =>
          new Synthesizer().notes([60, 64]).xox([1, 0, 1, 1]).hex("a"),
        expected: [[{ value: 60, offset: 0, duration: 1 / 4, stepIndex: 0 }]],
      },
      {
        name: "sequence after xox",
        instrument: () =>
          new Synthesizer().notes([60, 64]).xox([1, 0, 1, 1]).sequence(4, 0, 2),
        expected: [
          [{ value: 60, offset: 0, duration: 1 / 4, stepIndex: 0 }],
          [{ value: 60, offset: 2 / 4, duration: 1 / 4, stepIndex: 2 }],
        ],
      },
    ];

    for (const { name, instrument, expected } of fixtures) {
      const fixture = getStaticMaskFixture(instrument().getSchema());
      expect(fixture.source, name).toEqual(
        expected.map((bar) => bar.map((step) => step.value)),
      );
      expect(fixture.mask, name).toEqual(
        expected.map((bar) =>
          bar.map(({ offset, duration, stepIndex }) => ({
            offset,
            duration,
            stepIndex,
          })),
        ),
      );
    }
  });

  it("keeps sampler source notes separate from the trigger mask", () => {
    const schema = new Sampler("kick")
      .notes([0, 12])
      .xox([1, 0, 1, 1])
      .getSchema();

    expect(schema.notes.source.type).toBe("static");
    if (schema.notes.source.type === "static") {
      expect(schema.notes.source.cycle[0].map((step) => step.value)).toEqual([
        0, 12, 0,
      ]);
    }
    expect(schema.notes.mask?.type).toBe("static");
    if (schema.notes.mask?.type === "static") {
      expect(schema.notes.mask.cycle[0].map((step) => step.stepIndex)).toEqual([
        0, 2, 3,
      ]);
    }

    expect(getStaticMaskFixture(schema)).toEqual({
      source: [[0, 12, 0]],
      mask: [
        [
          { offset: 0, duration: 1 / 4, stepIndex: 0 },
          { offset: 2 / 4, duration: 1 / 4, stepIndex: 2 },
          { offset: 3 / 4, duration: 1 / 4, stepIndex: 3 },
        ],
      ],
    });
  });

  it("preserves a binary random cycle as a dynamic trigger mask", () => {
    const mask = new RandomCycle().chance(0.6).bin().steps(16, 0);
    const schema = new Synthesizer().notes([60]).xox(mask).getSchema();

    expect(schema.notes.source.type).toBe("static");
    expect(schema.notes.mask).toMatchObject({
      type: "random",
      dataType: "binary",
      chance: 0.6,
    });
    if (schema.notes.mask?.type === "random") {
      expect(schema.notes.mask.grid.cycle.map((bar) => bar.length)).toEqual([
        16, 0,
      ]);
    }
  });

  it("rejects non-binary random trigger masks during schema construction", () => {
    expect(() =>
      new Synthesizer().xox(new RandomCycle().range(0, 1)).getSchema(),
    ).toThrow("Instrument.xox() random masks must be binary");
    expect(() =>
      new Synthesizer().xox(new RandomCycle().bin().int()).getSchema(),
    ).toThrow("Instrument.xox() random masks must be binary");
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
      expect(adsrThenGain.max.cycle[0][0].value).toBe(0.5);
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
