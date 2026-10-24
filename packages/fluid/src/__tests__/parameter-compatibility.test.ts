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
        min: { type: "static", cycle: [[0]] },
        max: { type: "static", cycle: [[1]] },
      },
      {
        label: "explicit undefined",
        args: [undefined],
        min: { type: "static", cycle: [[0]] },
        max: { type: "static", cycle: [[1]] },
      },
      {
        label: "numeric maximum",
        args: [0.25],
        min: { type: "static", cycle: [[0]] },
        max: { type: "static", cycle: [[0.25]] },
      },
      {
        label: "numeric zero maximum",
        args: [0],
        min: { type: "static", cycle: [[0]] },
        max: { type: "static", cycle: [[0]] },
      },
      {
        label: "shorthand maximum",
        args: ["0.25"],
        min: { type: "static", cycle: [[0]] },
        max: { type: "static", cycle: [[0.25]] },
      },
      {
        label: "reusable shorthand maximum",
        args: [d.sh("0.25")],
        min: { type: "static", cycle: [[0]] },
        max: { type: "static", cycle: [[0.25]] },
      },
      {
        label: "two scalar fields",
        args: [0.25, 0.75],
        min: { type: "static", cycle: [[0.25]] },
        max: { type: "static", cycle: [[0.75]] },
      },
      {
        label: "sole random maximum",
        args: [randomSole],
        min: { type: "static", cycle: [[0]] },
        max: { type: "random-number", valuesPerBar: [2, 0] },
      },
      {
        label: "two-field random maximum",
        args: [0, randomWithMinimum],
        min: { type: "static", cycle: [[0]] },
        max: { type: "random-number", valuesPerBar: [1, 2] },
      },
      {
        label: "two-field structured maximum",
        args: [0, [0.25, 0.5], [0.75]],
        min: { type: "static", cycle: [[0]] },
        max: { type: "static", cycle: [[0.25, 0.5], [0.75]] },
      },
    ] as const;

    for (const { label, args, min, max } of cases) {
      const factory = Reflect.apply(d.env, d, args).getSchema();
      const constructor = Reflect.construct(Envelope, args).getSchema();

      expect(factory, label).toEqual(constructor);
      expect(factory.min, label).toEqual(min);
      expect(factory.max, label).toMatchObject(max);
    }
  });

  it("keeps constructor and factory parity for two-field shorthand and shared patterns", () => {
    const d = new Drome();
    const cases = [
      [0.1, 0.8],
      ["0.1 0.2", "0.8 0.9"],
      [d.sh("0.1 0.2"), d.sh("0.8 0.9")],
      [d.str(0.1, 0.2), d.str(0.8, 0.9)],
    ] as const;

    for (const args of cases) {
      expect(d.env(...args).getSchema()).toEqual(
        new Envelope(...args).getSchema(),
      );
    }
  });

  it("validates both patterned bounds through the public graph schema", () => {
    const d = new Drome();
    const minimum = d.str(0.2, 0.3);
    const maximum = d.rand().steps(2).range(-1, 1);
    d.synth().gain(d.env(minimum, maximum)).push();

    const instrument = d.getSchema().instruments[0];
    expect(instrument.gain.min).toEqual({
      type: "static",
      cycle: [[0.2], [0.3]],
    });
    expect(instrument.gain.max).toEqual(maximum.getRandomSchema());
  });

  it("supports typed single undefined and reusable maximums", () => {
    const d = new Drome();
    const maximum = d.sh("0.25");
    const factory = d.env(undefined);
    const constructor = new Envelope(undefined);

    expect(factory.getSchema()).toEqual(constructor.getSchema());
    expect(factory.getSchema()).toMatchObject({
      min: { type: "static", cycle: [[0]] },
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

  it("accepts a random minimum with an explicit maximum", () => {
    const d = new Drome();
    const random = d.rand().steps(2).range(0, 1);

    expect(d.env(random, 0.5).getSchema().min).toMatchObject({
      type: "random-number",
      valuesPerBar: [2],
    });
    expect(new Envelope(random, 0.5).getSchema()).toEqual(
      d.env(random, 0.5).getSchema(),
    );
  });

  it("updates random bounds independently and snapshots reusable static bounds", () => {
    const d = new Drome();
    const minimum = d.rand().steps(1).range(-1, 0);
    const maximum = d.rand().steps(2).range(1, 2);
    const envelope = d.env(minimum, maximum);
    const initialMaximum = envelope.getSchema().max;

    minimum.steps(3, 0);
    expect(envelope.getSchema().min).toEqual(minimum.getRandomSchema());
    expect(envelope.getSchema().max).toEqual(initialMaximum);

    maximum.steps(4, 1);
    expect(envelope.getSchema().min).toEqual(minimum.getRandomSchema());
    expect(envelope.getSchema().max).toEqual(maximum.getRandomSchema());

    const sharedMinimum = d.str(0.1, 0.2);
    const sharedMaximum = d.str(0.8, 0.9);
    const first = d.env(sharedMinimum, sharedMaximum);
    const second = d.env(sharedMinimum, sharedMaximum);
    const firstMinimum = first.getSchema().min;
    if (firstMinimum.type !== "static") throw new Error("Expected static min");
    firstMinimum.cycle[0][0] = 9;

    expect(second.getSchema().min).toEqual({
      type: "static",
      cycle: [[0.1], [0.2]],
    });
    expect(sharedMinimum.getValues()).toEqual([0.1, 0.2]);
    expect(sharedMaximum.getValues()).toEqual([0.8, 0.9]);
  });

  it("changes only an instrument gain maximum and keeps envelope state", () => {
    const d = new Drome();
    const instrument = d
      .synth()
      .gain(d.env(0.4, 0.8).adsr(0.2, 0.3, 0.6, 0.1).mode("bounded"));
    const before = instrument.getSchema().gain;

    instrument.gain(d.str(0.2, 0.5));
    const after = instrument.getSchema().gain;

    expect(after.min).toEqual(before.min);
    expect(after.a).toEqual(before.a);
    expect(after.d).toEqual(before.d);
    expect(after.s).toEqual(before.s);
    expect(after.r).toEqual(before.r);
    expect(after.mode).toBe(before.mode);
    expect(after.max).toEqual({
      type: "static",
      cycle: [[0.2], [0.5]],
    });
  });

  it("does not partially update bounds or ADSR after failed setters", () => {
    const d = new Drome();
    const envelope = d.env(0.3, 0.8).adsr(0.2, 0.3, 0.6, 0.1).mode("bounded");
    const before = envelope.getSchema();

    expect(() =>
      Reflect.apply(envelope.max, envelope, [d.str(null)]),
    ).toThrow();
    expect(envelope.getSchema()).toEqual(before);

    expect(() =>
      Reflect.apply(envelope.adsr, envelope, [0.5, [0.1, 0.2], 0.7, 0.1]),
    ).toThrow("positional arrays are not supported");
    expect(envelope.getSchema()).toEqual(before);

    const instrument = d.synth().gain(envelope);
    const instrumentBefore = instrument.getSchema().gain;
    expect(() =>
      Reflect.apply(instrument.gain, instrument, [d.str(null)]),
    ).toThrow();
    expect(instrument.getSchema().gain).toEqual(instrumentBefore);

    for (const invalid of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      [Number.NEGATIVE_INFINITY],
      [d.env()],
    ]) {
      expect(() =>
        Reflect.apply(instrument.gain, instrument, [invalid]),
      ).toThrow("gain()");
      expect(instrument.getSchema().gain).toEqual(instrumentBefore);
    }

    const typeChecks = () => {
      // @ts-expect-error Envelope exposes no minimum setter.
      envelope.min(0.1);
    };
    void typeChecks;
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

    expect(() => new Envelope(Number.NaN, 1)).toThrow(
      "[Envelope] constructor minimum",
    );
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
