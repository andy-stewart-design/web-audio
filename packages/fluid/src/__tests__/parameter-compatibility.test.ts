import { validateDromeGraph } from "@web-audio/schema";
import { RandomCycle } from "@web-audio/patterns";
import { describe, expect, it } from "vitest";
import Drome from "@/drome";
import Envelope from "@/automations/envelope";
import Filter from "@/effects/filter";
import GainEffect from "@/effects/gain";
import Parameter from "@/parameters/parameter";
import Sampler from "@/instruments/sampler";
import Synthesizer from "@/instruments/synthesizer";
import UnisonSynthesizer from "@/instruments/unison-synthesizer";

function staticCycle(pattern: { type: string; cycle?: number[][] }) {
  expect(pattern.type).toBe("static");
  if (pattern.type !== "static" || pattern.cycle === undefined) {
    throw new Error("Expected a static numeric pattern");
  }
  return pattern.cycle;
}

function staticValue(pattern: { type: string; cycle?: number[][] }) {
  return staticCycle(pattern)[0][0];
}

describe("structured parameter compatibility", () => {
  it("keeps envelope factory and constructor dispatch in parity", () => {
    const d = new Drome();
    const randomSole = new RandomCycle().steps(2, 0).range(-1, 1);
    const randomWithMinimum = new RandomCycle().steps(1, 2).range(0, 1);
    const cases = [
      {
        label: "omitted",
        args: [],
        min: 0,
        max: { type: "static", cycle: [[1]] },
      },
      {
        label: "explicit undefined",
        args: [undefined],
        min: 0,
        max: { type: "static", cycle: [[1]] },
      },
      {
        label: "numeric maximum",
        args: [0.25],
        min: 0,
        max: { type: "static", cycle: [[0.25]] },
      },
      {
        label: "numeric zero maximum",
        args: [0],
        min: 0,
        max: { type: "static", cycle: [[0]] },
      },
      {
        label: "shorthand maximum",
        args: ["0.25"],
        min: 0,
        max: { type: "static", cycle: [[0.25]] },
      },
      {
        label: "reusable shorthand maximum",
        args: [d.sh("0.25")],
        min: 0,
        max: { type: "static", cycle: [[0.25]] },
      },
      {
        label: "two scalar fields",
        args: [0.25, 0.75],
        min: 0.25,
        max: { type: "static", cycle: [[0.75]] },
      },
      {
        label: "sole random maximum",
        args: [randomSole],
        min: 0,
        max: { type: "random-number", valuesPerBar: [2, 0] },
      },
      {
        label: "two-field random maximum",
        args: [0, randomWithMinimum],
        min: 0,
        max: { type: "random-number", valuesPerBar: [1, 2] },
      },
      {
        label: "two-field structured maximum",
        args: [0, [0.25, 0.5], [0.75]],
        min: 0,
        max: { type: "static", cycle: [[0.25, 0.5], [0.75]] },
      },
    ] as const;

    for (const { label, args, min, max } of cases) {
      const factory = Reflect.apply(d.env, d, args).getSchema();
      const constructor = Reflect.construct(Envelope, args).getSchema();

      expect(factory, label).toEqual(constructor);
      expect(factory.min, label).toBe(min);
      expect(factory.max, label).toMatchObject(max);
    }
  });

  it("supports typed single undefined and reusable maximums", () => {
    const d = new Drome();
    const maximum = d.sh("0.25");
    const factory = d.env(undefined);
    const constructor = new Envelope(undefined);

    expect(factory.getSchema()).toEqual(constructor.getSchema());
    expect(factory.getSchema()).toMatchObject({
      min: 0,
      max: { type: "static", cycle: [[1]] },
    });

    expect(d.env(0.1, maximum).getSchema()).toEqual(
      new Envelope(0.1, maximum).getSchema(),
    );
    const random = d.rand().steps(2).range(0, 1);
    expect(d.env(random).getSchema()).toEqual(new Envelope(random).getSchema());
    expect(d.env(0, random).getSchema()).toEqual(
      new Envelope(0, random).getSchema(),
    );
  });

  it("rejects undefined in every multi-field envelope position", () => {
    const d = new Drome();
    const random = d.rand().steps(2).range(0, 1);
    const invalid = [
      [undefined, 0.8],
      [0.1, undefined],
      [undefined, undefined],
      [undefined, "0.8"],
      [undefined, random],
      [undefined, [0.25, 0.5]],
      [0, [0.25], undefined],
      [0, undefined, [0.5]],
    ];

    for (const args of invalid) {
      expect(() => Reflect.apply(d.env, d, args)).toThrow();
      expect(() => Reflect.construct(Envelope, args)).toThrow();
    }

    const assertTypeRejections = () => {
      // @ts-expect-error An undefined minimum cannot accompany a maximum.
      d.env(undefined, 0.8);
      // @ts-expect-error An undefined minimum cannot accompany a maximum.
      new Envelope(undefined, 0.8);
      // @ts-expect-error An undefined maximum cannot accompany a minimum.
      d.env(0.1, undefined);
      // @ts-expect-error An undefined maximum cannot accompany a minimum.
      new Envelope(0.1, undefined);
      // @ts-expect-error Two undefined envelope fields are not a default form.
      d.env(undefined, undefined);
      // @ts-expect-error Two undefined envelope fields are not a default form.
      new Envelope(undefined, undefined);
      // @ts-expect-error Undefined cannot accompany a shorthand maximum.
      d.env(undefined, "0.8");
      // @ts-expect-error Undefined cannot accompany a shorthand maximum.
      new Envelope(undefined, "0.8");
      // @ts-expect-error Undefined cannot accompany a random maximum.
      d.env(undefined, random);
      // @ts-expect-error Undefined cannot accompany a random maximum.
      new Envelope(undefined, random);
      // @ts-expect-error Undefined cannot accompany a raw maximum array.
      d.env(undefined, [0.25, 0.5]);
      // @ts-expect-error Undefined cannot accompany a raw maximum array.
      new Envelope(undefined, [0.25, 0.5]);
    };
    void assertTypeRejections;
  });

  it("equates scalar, negative, and zero maxima with shorthand", () => {
    const d = new Drome();
    for (const value of [-0.25, 0, 0.25]) {
      expect(d.env(value).getSchema().max).toEqual(
        d.env(String(value)).getSchema().max,
      );
      expect(new Envelope(value).getSchema().max).toEqual(
        new Envelope(String(value)).getSchema().max,
      );
    }
  });

  it("rejects null as either bound in both entry points", () => {
    const d = new Drome();
    for (const args of [[null], [null, 0.5], [0.5, null]]) {
      expect(() => Reflect.apply(d.env, d, args)).toThrow("cannot be null");
      expect(() => Reflect.construct(Envelope, args)).toThrow("cannot be null");
    }
  });

  it("rejects a random maximum followed by another field", () => {
    const d = new Drome();
    const random = d.rand().steps(2).range(0, 1);

    expect(() => Reflect.apply(d.env, d, [random, 0.5])).toThrow(
      "minimum must be a number",
    );
    expect(() => Reflect.construct(Envelope, [random, 0.5])).toThrow(
      "minimum must be a number",
    );

    const assertTypeRejections = () => {
      // @ts-expect-error A random cycle cannot be the envelope minimum.
      d.env(random, 0.5);
      // @ts-expect-error A random cycle cannot be the envelope minimum.
      new Envelope(random, 0.5);
    };
    void assertTypeRejections;
  });

  it("separates numeric serialization failures from graph validation", () => {
    expect(() => new Parameter([]).getSchema()).toThrow(
      "ValueCycle cannot serialize an empty bar",
    );

    const emptyParameterSchema = new Parameter().getSchema();
    expect(emptyParameterSchema).toEqual({ type: "static", cycle: [] });
    const instrument = new Synthesizer().getSchema();
    instrument.detune = emptyParameterSchema;
    expect(() =>
      validateDromeGraph({
        bpm: undefined,
        instruments: [instrument],
        banks: {},
        buses: {},
      }),
    ).toThrow("Instrument 0.detune.cycle must contain at least one bar");

    const nonFiniteEnvelope = new Synthesizer()
      .gain(new Envelope(Number.NaN, 1))
      .getSchema();
    expect(nonFiniteEnvelope.gain.min).toBeNaN();
    expect(() =>
      validateDromeGraph({
        bpm: undefined,
        instruments: [nonFiniteEnvelope],
        banks: {},
        buses: {},
      }),
    ).toThrow("Instrument 0.gain.min must be finite");
  });

  it("preserves supported source schemas and contextual MIDI identities", () => {
    const d = new Drome();
    const envelope = d.env(0, 1).adsr(0.01, 0.2, 0.8, 0.1);
    const lfo = d.lfo(0, 1);
    const midi = d.midi.cc("controller", 74).channel(3);

    const synth = new Synthesizer().detune(envelope).noise(lfo).getSchema();
    expect(synth.detune).toEqual(envelope.getSchema());
    expect(synth.noise?.gain).toEqual(lfo.getSchema());

    const filter = new Filter("lp", midi)
      .q(midi)
      .detune(midi)
      .gain(midi)
      .getSchema();
    expect(filter.frequency).toEqual(midi.getSchema("frequency"));
    expect(filter.q).toEqual(midi.getSchema("q"));
    expect(filter.detune).toEqual(midi.getSchema("detune"));
    expect(filter.gain).toEqual(midi.getSchema("filterGain"));

    const gain = new GainEffect(midi).getSchema();
    expect(gain.gain).toEqual(midi.getSchema("gain"));

    const unison = new UnisonSynthesizer().spread(midi).width(midi).getSchema();
    expect(unison.spread).toEqual(midi.getSchema("spread"));
    expect(unison.width).toEqual(midi.getSchema("width"));
  });

  it("forwards each positional ADSR field independently through instruments", () => {
    const schema = new Synthesizer()
      .adsr("0.01 0.02", "0.1", "0.8 0.7", "0.2 0.3")
      .getSchema().gain;

    expect(staticCycle(schema.a)).toEqual([[0.01, 0.02]]);
    expect(staticCycle(schema.d)).toEqual([[0.1]]);
    expect(staticCycle(schema.s)).toEqual([[0.8, 0.7]]);
    expect(staticCycle(schema.r)).toEqual([[0.2, 0.3]]);
  });

  it("keeps noise defaults, selector aliases, and sampler duration aliases", () => {
    const defaultNoise = new Synthesizer().noise().getSchema().noise;
    expect(defaultNoise).toMatchObject({ color: "white" });
    expect(defaultNoise && staticValue(defaultNoise.gain)).toBe(1);

    const pinkNoise = new Synthesizer().noise("pink").getSchema().noise;
    expect(pinkNoise).toMatchObject({ color: "pink" });
    expect(pinkNoise && staticValue(pinkNoise.gain)).toBe(1);

    const duration = new Sampler("bd").duration(0.25).getSchema();
    const alias = new Sampler("bd").dur(0.25).getSchema();
    expect(alias.region).toEqual(duration.region);
  });

  it("retains random source state when shared across parameter consumers", () => {
    const random = new RandomCycle().steps(2, 0).range(0, 1);
    const parameter = new Parameter(random);
    const envelope = new Envelope(0, random);

    random.steps(1, 3);

    expect(parameter.getSchema()).toMatchObject({
      type: "random-number",
      valuesPerBar: [1, 3],
    });
    expect(envelope.getSchema().max).toMatchObject({
      type: "random-number",
      valuesPerBar: [1, 3],
    });
  });
});
