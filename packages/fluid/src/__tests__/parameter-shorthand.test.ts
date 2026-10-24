import { createShorthand, RandomCycle } from "@web-audio/patterns";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import Drome from "@/drome";
import Envelope from "@/automations/envelope";
import Filter from "@/effects/filter";
import GainEffect from "@/effects/gain";
import Parameter from "@/parameters/parameter";
import type {
  ADSRInput,
  NumericPatternInput,
  SingleSlotAudioParamInput,
} from "@/inputs/types";
import Sampler from "@/instruments/sampler";
import UnisonSynthesizer from "@/instruments/unison-synthesizer";

function staticCycle(pattern: { type: string; cycle?: number[][] }) {
  expect(pattern.type).toBe("static");
  if (pattern.type !== "static" || pattern.cycle === undefined) {
    throw new Error("Expected a static numeric pattern");
  }
  return pattern.cycle;
}

function numericInputs(
  d: Drome,
  source = "0.2 0.8",
  values: number[] = [0.2, 0.8],
) {
  return [
    { name: "direct", input: [source], single: source },
    { name: "reusable", input: [d.sh(source)], single: d.sh(source) },
    { name: "structured", input: [values], single: d.str(values) },
  ] satisfies {
    name: string;
    input: NumericPatternInput;
    single: SingleSlotAudioParamInput;
  }[];
}

describe("public parameter shorthand", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    { name: "direct", input: ["0.2 0.8"], single: "0.2 0.8" },
    {
      name: "reusable",
      input: [new Drome().sh("0.2 0.8")],
      single: new Drome().sh("0.2 0.8"),
    },
    {
      name: "structured",
      input: [[0.2, 0.8]],
      single: new Drome().str([0.2, 0.8]),
    },
  ] satisfies {
    name: string;
    input: NumericPatternInput;
    single: SingleSlotAudioParamInput;
  }[])(
    "matches $name numeric parameter inputs across public consumers",
    ({ input, single }) => {
      const d = new Drome();
      const expected = [[0.2, 0.8]];

      expect(
        staticCycle(
          d
            .synth()
            .detune(...input)
            .getSchema().detune,
        ),
      ).toEqual(expected);
      expect(
        staticCycle(
          d
            .sample("bd")
            .detune(...input)
            .getSchema().detune,
        ),
      ).toEqual(expected);
      expect(
        staticCycle(
          d
            .synth()
            .gain(...input)
            .getSchema().gain.max,
        ),
      ).toEqual(expected);
      expect(
        staticCycle(
          d
            .sample("bd")
            .gain(...input)
            .getSchema().gain.max,
        ),
      ).toEqual(expected);
      expect(
        staticCycle(d.synth().noise(single).getSchema().noise!.gain),
      ).toEqual(expected);
      expect(
        staticCycle(d.sample("bd").noise(single).getSchema().noise!.gain),
      ).toEqual(expected);

      for (const alias of ["lpf", "hpf", "bpf"] as const) {
        expect(staticCycle(d[alias](...input).getSchema().frequency)).toEqual(
          expected,
        );
      }
      expect(staticCycle(d.filter("bp", single).getSchema().frequency)).toEqual(
        expected,
      );
    },
  );

  it("covers inherited unison aliases across detune, gain, noise, and ADSR", () => {
    const d = new Drome();
    for (const alias of ["unison", "uni"] as const) {
      for (const input of ["0.2 0.8", d.shorthand("0.2 0.8")] as const) {
        const instrument = d
          .synth(alias)
          .detune(input)
          .gain(input)
          .noise(input)
          .adsr(input, 0.1, 0.8, 0.2);
        const schema = instrument.getSchema();
        expect(staticCycle(schema.detune)).toEqual([[0.2, 0.8]]);
        expect(staticCycle(schema.gain.max)).toEqual([[0.2, 0.8]]);
        expect(staticCycle(schema.noise!.gain)).toEqual([[0.2, 0.8]]);
        expect(staticCycle(schema.gain.a)).toEqual([[0.2, 0.8]]);
      }
    }
  });

  it("matches constructor and factory shorthand rows across public slots", () => {
    const rows = [
      (d: Drome, input: NumericPatternInput) =>
        d.gain(...input).getSchema().gain,
      (_d: Drome, input: NumericPatternInput) =>
        new GainEffect(...input).getSchema().gain,
      (
        _d: Drome,
        _input: NumericPatternInput,
        single: SingleSlotAudioParamInput,
      ) => new Filter("lp", single).getSchema().frequency,
      (
        d: Drome,
        _input: NumericPatternInput,
        single: SingleSlotAudioParamInput,
      ) => d.filter("lp", single).getSchema().frequency,
      (d: Drome, input: NumericPatternInput) =>
        d.lpf(...input).getSchema().frequency,
      (d: Drome, input: NumericPatternInput) =>
        d.hpf(...input).getSchema().frequency,
      (d: Drome, input: NumericPatternInput) =>
        d.bpf(...input).getSchema().frequency,
    ];
    const d = new Drome();

    for (const { input, single } of numericInputs(d)) {
      for (const read of rows) {
        expect(staticCycle(read(d, input, single))).toEqual([[0.2, 0.8]]);
      }
    }
  });

  it("matches every filter and unison parameter in direct, reusable, and structured forms", () => {
    const d = new Drome();
    const filterRows = [
      {
        name: "q",
        apply: (f: Filter, input: NumericPatternInput) => f.q(...input),
        key: "q",
      },
      {
        name: "detune",
        apply: (f: Filter, input: NumericPatternInput) => f.detune(...input),
        key: "detune",
      },
      {
        name: "gain",
        apply: (f: Filter, input: NumericPatternInput) => f.gain(...input),
        key: "gain",
      },
    ] as const;
    for (const { input, single } of numericInputs(d)) {
      const frequency = new Filter("lp", single).getSchema().frequency;
      expect(staticCycle(frequency)).toEqual([[0.2, 0.8]]);
      for (const row of filterRows) {
        const filter = new Filter("lp", 400);
        row.apply(filter, input);
        expect(staticCycle(filter.getSchema()[row.key])).toEqual([[0.2, 0.8]]);
      }
    }

    const unisonRows = [
      {
        apply: (u: UnisonSynthesizer, input: NumericPatternInput) =>
          u.voices(...input),
        key: "voices",
      },
      {
        apply: (u: UnisonSynthesizer, input: NumericPatternInput) =>
          u.spread(...input),
        key: "spread",
      },
      {
        apply: (u: UnisonSynthesizer, input: NumericPatternInput) =>
          u.width(...input),
        key: "width",
      },
    ] as const;
    for (const { input } of numericInputs(d, "4 8", [4, 8])) {
      for (const row of unisonRows) {
        const unison = d.synth("unison");
        row.apply(unison, input);
        expect(staticCycle(unison.getSchema()[row.key])).toEqual([[4, 8]]);
      }
    }
  });

  it("covers filter setters, aliases, and unison slots", () => {
    const d = new Drome();
    const filter = new Filter("lp", "400 800")
      .q(d.sh("1 2"))
      .detune("0 12")
      .gain([0.1, 0.2])
      .getSchema();

    expect(staticCycle(filter.frequency)).toEqual([[400, 800]]);
    expect(staticCycle(filter.q)).toEqual([[1, 2]]);
    expect(staticCycle(filter.detune)).toEqual([[0, 12]]);
    expect(staticCycle(filter.gain)).toEqual([[0.1, 0.2]]);
    expect(
      staticCycle(new Drome().hpf("200 400").getSchema().frequency),
    ).toEqual([[200, 400]]);
    expect(
      staticCycle(new Drome().bpf("200 400").getSchema().frequency),
    ).toEqual([[200, 400]]);

    const unison = d.synth("unison");
    expect(staticCycle(unison.voices("4 8").getSchema().voices)).toEqual([
      [4, 8],
    ]);
    expect(staticCycle(unison.spread("10 20").getSchema().spread)).toEqual([
      [10, 20],
    ]);
    expect(
      staticCycle(unison.width(d.sh("0.2 0.4")).getSchema().width),
    ).toEqual([[0.2, 0.4]]);
  });

  it("dispatches white and pink noise prefixes for every numeric input form", () => {
    const d = new Drome();
    for (const color of ["white", "pink"] as const) {
      for (const { single } of numericInputs(d)) {
        const noise = d.synth().noise(color, single).getSchema().noise;
        if (!noise) throw new Error("Expected a noise schema");
        expect(noise.color).toBe(color);
        expect(staticCycle(noise.gain)).toEqual([[0.2, 0.8]]);
      }
    }

    const direct = d.synth().noise("0.2 0.8").getSchema().noise;
    const explicitWhite = d.synth().noise("white", 1).getSchema().noise;
    const explicitPink = d.synth().noise("pink", 1).getSchema().noise;
    if (!direct || !explicitWhite || !explicitPink) {
      throw new Error("Expected noise schemas");
    }
    expect(direct.color).toBe("white");
    expect(staticCycle(direct.gain)).toEqual([[0.2, 0.8]]);
    expect(explicitWhite).toMatchObject({
      color: "white",
      gain: { type: "static", cycle: [[1]] },
    });
    expect(explicitPink).toMatchObject({
      color: "pink",
      gain: { type: "static", cycle: [[1]] },
    });
  });

  it("matches envelope max and ADSR setters in direct, reusable, and structured forms", () => {
    const d = new Drome();
    const rows = [
      {
        name: "max",
        apply: (e: Envelope, input: NumericPatternInput) => e.max(...input),
        key: "max",
      },
      {
        name: "a",
        apply: (e: Envelope, input: NumericPatternInput) => e.a(...input),
        key: "a",
      },
      {
        name: "d",
        apply: (e: Envelope, input: NumericPatternInput) => e.d(...input),
        key: "d",
      },
      {
        name: "s",
        apply: (e: Envelope, input: NumericPatternInput) => e.s(...input),
        key: "s",
      },
      {
        name: "r",
        apply: (e: Envelope, input: NumericPatternInput) => e.r(...input),
        key: "r",
      },
    ] as const;
    for (const { input } of numericInputs(d)) {
      for (const row of rows) {
        const envelope = new Envelope();
        row.apply(envelope, input);
        expect(staticCycle(envelope.getSchema()[row.key])).toEqual([
          [0.2, 0.8],
        ]);
      }
    }
  });

  it("supports envelope constructor and factory sole and explicit-min overloads", () => {
    const d = new Drome();
    for (const { input } of numericInputs(d).slice(0, 2)) {
      const constructorSole = Reflect.construct(Envelope, input).getSchema();
      const factorySole = Reflect.apply(d.env, d, input).getSchema();
      expect(constructorSole.min).toEqual({ type: "static", cycle: [[0]] });
      expect(factorySole.min).toEqual({ type: "static", cycle: [[0]] });
      expect(staticCycle(constructorSole.max)).toEqual([[0.2, 0.8]]);
      expect(staticCycle(factorySole.max)).toEqual([[0.2, 0.8]]);
    }
    for (const { input } of numericInputs(d)) {
      const constructorNumeric = Reflect.construct(Envelope, [
        0.1,
        ...input,
      ]).getSchema();
      const factoryNumeric = Reflect.apply(d.env, d, [
        0.1,
        ...input,
      ]).getSchema();
      expect(constructorNumeric.min).toEqual({
        type: "static",
        cycle: [[0.1]],
      });
      expect(factoryNumeric.min).toEqual({ type: "static", cycle: [[0.1]] });
      expect(staticCycle(constructorNumeric.max)).toEqual([[0.2, 0.8]]);
      expect(staticCycle(factoryNumeric.max)).toEqual([[0.2, 0.8]]);
      const invalid = [undefined, ...input];
      expect(() => Reflect.construct(Envelope, invalid)).toThrow();
      expect(() => Reflect.apply(d.env, d, invalid)).toThrow();
    }
    expect(new Envelope(0.1).getSchema().max).toEqual({
      type: "static",
      cycle: [[0.1]],
    });
    expect(d.env(0.1).getSchema().max).toEqual({
      type: "static",
      cycle: [[0.1]],
    });
    expect(() => Reflect.apply(d.env, d, [null, 0.5])).toThrow(
      "minimum cannot be null",
    );
  });

  it("supports positional ADSR shorthand rows and mixed fields", () => {
    const d = new Drome();
    const rows = [
      { name: "a", index: 0 },
      { name: "d", index: 1 },
      { name: "s", index: 2 },
      { name: "r", index: 3 },
    ] as const;
    const baseline: ADSRInput[] = [0.01, 0.2, 0.8, 0.1];
    const positionalInputs: [ADSRInput][] = [["0.2 0.8"], [d.sh("0.2 0.8")]];
    for (const row of rows) {
      for (const input of positionalInputs) {
        const values = [...baseline];
        values[row.index] = input[0];
        const envelope = new Envelope().adsr(
          values[0],
          values[1],
          values[2],
          values[3],
        );
        expect(staticCycle(envelope.getSchema()[row.name])).toEqual([
          [0.2, 0.8],
        ]);
      }
    }

    const mixed = new Envelope()
      .adsr("0.01 0.02", d.sh("0.2 0.3"), "0.8 0.7", 0.1)
      .getSchema();
    expect(staticCycle(mixed.a)).toEqual([[0.01, 0.02]]);
    expect(staticCycle(mixed.d)).toEqual([[0.2, 0.3]]);
    expect(staticCycle(mixed.s)).toEqual([[0.8, 0.7]]);
    expect(staticCycle(mixed.r)).toEqual([[0.1]]);
  });

  it("rolls back all positional ADSR fields on envelope and instrument failures", () => {
    const d = new Drome();
    const baseline: ADSRInput[] = [0.1, 0.2, 0.8, 0.1];
    for (const index of [0, 1, 2, 3]) {
      const envelope = new Envelope().adsr(
        baseline[0],
        baseline[1],
        baseline[2],
        baseline[3],
      );
      const before = envelope.getSchema();
      const invalid = [...baseline];
      invalid[index] = "0.2 ~";
      expect(() => Reflect.apply(envelope.adsr, envelope, invalid)).toThrow();
      expect(envelope.getSchema()).toEqual(before);

      const instrument = d
        .synth()
        .adsr(baseline[0], baseline[1], baseline[2], baseline[3]);
      const instrumentBefore = instrument.getSchema();
      expect(() =>
        Reflect.apply(instrument.adsr, instrument, invalid),
      ).toThrow();
      expect(instrument.getSchema()).toEqual(instrumentBefore);
    }
  });

  it("updates an instrument gain maximum without replacing its envelope settings", () => {
    const d = new Drome();
    const replacement = new Envelope(0.4, 0.9)
      .adsr(0.3, 0.2, 0.7, 0.15)
      .mode("bounded");
    const instrument = d.synth().gain(replacement);

    instrument.gain("0.2 0.8");
    expect(instrument.getSchema().gain).toEqual({
      type: "envelope",
      min: { type: "static", cycle: [[0.4]] },
      max: { type: "static", cycle: [[0.2, 0.8]] },
      a: { type: "static", cycle: [[0.3]] },
      d: { type: "static", cycle: [[0.2]] },
      s: { type: "static", cycle: [[0.7]] },
      r: { type: "static", cycle: [[0.15]] },
      mode: "bounded",
    });

    const newEnvelope = new Envelope(0, 0.5).adsr(0.1, 0.2, 0.8, 0.1);
    instrument.gain(newEnvelope);
    expect(instrument.getSchema().gain).toEqual(newEnvelope.getSchema());
  });

  it("supports envelope overloads and independent shorthand ADSR fields", () => {
    const d = new Drome();
    const direct = d.env("0.2 0.8").getSchema();
    const reusable = d.env(d.sh("0.2 0.8")).getSchema();
    const explicit = d.env(0.1, "0.2 0.8").getSchema();
    const positional = new Envelope()
      .adsr("0.01 0.02", "0.1 0.2", d.sh("0.8 0.9"), 0.1)
      .getSchema();
    const individual = new Envelope()
      .max("0.7 0.8")
      .a(d.sh("0.01 0.02"))
      .d("0.1")
      .s([0.8, 0.9])
      .r(0.2)
      .getSchema();
    const instrumentAdsr = d
      .synth()
      .adsr("0.01 0.02", 0.1, d.sh("0.8 0.9"), 0.2)
      .getSchema().gain;

    expect(direct).toEqual(reusable);
    expect(direct.min).toEqual({ type: "static", cycle: [[0]] });
    expect(explicit.min).toEqual({ type: "static", cycle: [[0.1]] });
    expect(staticCycle(direct.max)).toEqual([[0.2, 0.8]]);
    expect(staticCycle(positional.a)).toEqual([[0.01, 0.02]]);
    expect(staticCycle(positional.d)).toEqual([[0.1, 0.2]]);
    expect(staticCycle(positional.s)).toEqual([[0.8, 0.9]]);
    expect(staticCycle(positional.r)).toEqual([[0.1]]);
    expect(staticCycle(individual.max)).toEqual([[0.7, 0.8]]);
    expect(staticCycle(individual.a)).toEqual([[0.01, 0.02]]);
    expect(staticCycle(individual.d)).toEqual([[0.1]]);
    expect(staticCycle(individual.s)).toEqual([[0.8, 0.9]]);
    expect(staticCycle(individual.r)).toEqual([[0.2]]);
    expect(staticCycle(instrumentAdsr.a)).toEqual([[0.01, 0.02]]);
    expect(staticCycle(instrumentAdsr.s)).toEqual([[0.8, 0.9]]);
    expect(staticCycle(new Envelope("0.2 0.8").getSchema().max)).toEqual([
      [0.2, 0.8],
    ]);
    expect(staticCycle(d.env(0.1).getSchema().max)).toEqual([[0.1]]);
    for (const minimum of ["0.2", d.sh("0.2")]) {
      const factory = Reflect.apply(d.env, d, [minimum, 0.5]).getSchema();
      const constructor = Reflect.construct(Envelope, [
        minimum,
        0.5,
      ]).getSchema();
      expect(factory).toEqual(constructor);
      expect(staticCycle(factory.min)).toEqual([[0.2]]);
      expect(staticCycle(factory.max)).toEqual([[0.5]]);
    }
  });

  it("rejects positional arrays and random cycles at runtime", () => {
    const d = new Drome();
    const baseline = [0.1, 0.2, 0.8, 0.1];

    for (const index of [0, 1, 2, 3]) {
      const invalid: unknown[] = [...baseline];
      invalid[index] = [0.2, 0.4];

      const envelope = new Envelope().adsr(
        baseline[0],
        baseline[1],
        baseline[2],
        baseline[3],
      );
      const beforeEnvelope = envelope.getSchema();
      expect(() => Reflect.apply(envelope.adsr, envelope, invalid)).toThrow(
        "positional arrays are not supported",
      );
      expect(envelope.getSchema()).toEqual(beforeEnvelope);

      const instrument = d
        .synth()
        .adsr(baseline[0], baseline[1], baseline[2], baseline[3]);
      const beforeInstrument = instrument.getSchema();
      expect(() => Reflect.apply(instrument.adsr, instrument, invalid)).toThrow(
        "positional arrays are not supported",
      );
      expect(instrument.getSchema()).toEqual(beforeInstrument);

      const randomInvalid: unknown[] = [...baseline];
      randomInvalid[index] = new RandomCycle().steps(2);
      const randomEnvelope = new Envelope().adsr(
        baseline[0],
        baseline[1],
        baseline[2],
        baseline[3],
      );
      const beforeRandomEnvelope = randomEnvelope.getSchema();
      expect(() =>
        Reflect.apply(randomEnvelope.adsr, randomEnvelope, randomInvalid),
      ).toThrow("positional random cycles are not supported");
      expect(randomEnvelope.getSchema()).toEqual(beforeRandomEnvelope);

      const randomInstrument = d
        .synth()
        .adsr(baseline[0], baseline[1], baseline[2], baseline[3]);
      const beforeRandomInstrument = randomInstrument.getSchema();
      expect(() =>
        Reflect.apply(randomInstrument.adsr, randomInstrument, randomInvalid),
      ).toThrow("positional random cycles are not supported");
      expect(randomInstrument.getSchema()).toEqual(beforeRandomInstrument);
    }
  });

  it("reports receiving slots and UTF-16 ranges for direct and reusable errors", () => {
    const d = new Drome();
    const cases = [
      ["NaN", "atom 'NaN' must be a finite numeric value", "[0, 3)"],
      ["0.2 ~ 0.8", "Rests are not supported in numeric patterns", "[4, 5)"],
      ["<1!1025>", "Alternation expands beyond 1024 choices", "[1, 7)"],
    ] as const;

    for (const [source, detail, range] of cases) {
      for (const input of [source, d.shorthand(source)] as const) {
        const instrument = d.synth().detune(0.75);
        const before = instrument.getSchema().detune;
        let thrown: unknown;
        try {
          instrument.detune(input);
        } catch (error) {
          thrown = error;
        }
        expect(thrown).toBeInstanceOf(Error);
        if (!(thrown instanceof Error)) throw new Error("Expected an error");
        expect(thrown.message).toContain("[Instrument] detune()");
        expect(thrown.message).toContain(detail);
        expect(thrown.message).toContain(`source range ${range}`);
        expect(instrument.getSchema().detune).toEqual(before);
      }
    }

    const mixed = d.synth().detune(0.5);
    const before = mixed.getSchema().detune;
    expect(() =>
      Reflect.apply(mixed.detune, mixed, ["0.2", d.shorthand("0.8")]),
    ).toThrow(
      "[Instrument] detune() shorthand input must be the sole argument",
    );
    expect(mixed.getSchema().detune).toEqual(before);

    const nested = d.synth().detune(0.5);
    const nestedBefore = nested.getSchema().detune;
    expect(() => nested.detune("<0.2 [0.8 ~]>")).toThrow(
      "[Instrument] detune() [Pattern] Rests are not supported in numeric patterns.",
    );
    expect(() => nested.detune("<0.2 [0.8 ~]>")).toThrow(
      "at source range [10, 11)",
    );
    expect(nested.getSchema().detune).toEqual(nestedBefore);
  });

  it("keeps prior state when shorthand dispatch fails", () => {
    const instrument = new Drome().synth().detune(0.75);
    const priorDetune = instrument.getSchema().detune;
    expect(() => instrument.detune("0.2 ~ 0.8")).toThrow(
      "[Instrument] detune()",
    );
    expect(instrument.getSchema().detune).toEqual(priorDetune);

    const envelope = new Envelope().adsr(0.1, 0.2, 0.8, 0.1);
    const priorAdsr = envelope.getSchema();
    expect(() => envelope.adsr("0.2", "0.3", "0.8", "0.2 ~")).toThrow(
      "[Envelope] adsr() r",
    );
    expect(envelope.getSchema()).toEqual(priorAdsr);

    const noise = new Drome().synth().noise(0.4);
    const priorNoise = noise.getSchema().noise;
    expect(() => noise.noise("0.2 ~")).toThrow("[Instrument] noise() gain");
    expect(noise.getSchema().noise).toEqual(priorNoise);
  });

  it("rejects public mixtures without changing mutable parameter slots", () => {
    const d = new Drome();
    const reusable = d.sh("0.2 0.8");
    const source = d.env(0, 1);
    const expectUnchanged = (read: () => unknown, call: () => unknown) => {
      const before = read();
      expect(call).toThrow();
      expect(read()).toEqual(before);
    };

    const instrument = d.synth().detune(0.5).gain(0.5).noise(0.5);
    expectUnchanged(
      () => instrument.getSchema().detune,
      () => Reflect.apply(instrument.detune, instrument, [0.2, "0.4"]),
    );
    expectUnchanged(
      () => instrument.getSchema().detune,
      () => Reflect.apply(instrument.detune, instrument, [0.2, reusable]),
    );
    expectUnchanged(
      () => instrument.getSchema().gain,
      () => Reflect.apply(instrument.gain, instrument, [0.2, reusable]),
    );
    expectUnchanged(
      () => instrument.getSchema().gain,
      () => Reflect.apply(instrument.gain, instrument, ["0.2", reusable]),
    );
    expectUnchanged(
      () => instrument.getSchema().noise,
      () => Reflect.apply(instrument.noise, instrument, [["0.2", reusable]]),
    );
    expectUnchanged(
      () => instrument.getSchema().noise,
      () => Reflect.apply(instrument.noise, instrument, [reusable, source]),
    );

    const filter = new Filter("lp", 400).q(1).detune(0).gain(0);
    expectUnchanged(
      () => filter.getSchema().q,
      () => Reflect.apply(filter.q, filter, [["0.2", reusable]]),
    );
    expectUnchanged(
      () => filter.getSchema().detune,
      () => Reflect.apply(filter.detune, filter, [reusable, 0.4]),
    );
    expectUnchanged(
      () => filter.getSchema().gain,
      () => Reflect.apply(filter.gain, filter, [[reusable]]),
    );

    const envelope = new Envelope().a(0.1).d(0.2).s(0.8).r(0.1);
    expectUnchanged(
      () => envelope.getSchema().a,
      () => Reflect.apply(envelope.a, envelope, [reusable, 0.4]),
    );
    expectUnchanged(
      () => envelope.getSchema().d,
      () => Reflect.apply(envelope.d, envelope, [reusable, source]),
    );

    const unison = d.synth("unison").voices(4).spread(1).width(0.4);
    expectUnchanged(
      () => unison.getSchema().voices,
      () => Reflect.apply(unison.voices, unison, [["4", reusable]]),
    );
    expectUnchanged(
      () => unison.getSchema().spread,
      () => Reflect.apply(unison.spread, unison, [reusable, source]),
    );
    expectUnchanged(
      () => unison.getSchema().width,
      () => Reflect.apply(unison.width, unison, [[reusable]]),
    );
  });

  it("contextualizes inherited, envelope, filter, and unison failures", () => {
    const instrument = new Drome().synth();
    expect(() => instrument.gain("NaN")).toThrow(
      "[Instrument] gain() atom 'NaN'",
    );
    expect(() => instrument.adsr(0.1, 0.2, 0.8, "NaN")).toThrow(
      "[Instrument] adsr() r",
    );

    const filter = new Filter("lp", 400).q(1);
    const filterBefore = filter.getSchema();
    expect(() => filter.q("NaN")).toThrow("[Filter] q() atom 'NaN'");
    expect(filter.getSchema()).toEqual(filterBefore);

    const unison = new Drome().synth("unison").voices(4);
    const unisonBefore = unison.getSchema();
    expect(() => unison.voices("NaN")).toThrow("[Unison] voices() atom 'NaN'");
    expect(unison.getSchema()).toEqual(unisonBefore);
  });

  it("rejects invalid string forms through the numeric boundary without mutation", () => {
    for (const source of ["name", "NaN", "0x10", "0.2 ~ 0.8"]) {
      const instrument = new Drome().synth().detune(0.75);
      const previous = instrument.getSchema().detune;
      expect(() =>
        Reflect.apply(instrument.detune, instrument, [source]),
      ).toThrow("[Instrument] detune()");
      expect(instrument.getSchema().detune).toEqual(previous);
    }

    const noise = new Drome().synth().noise(0.4);
    const previousNoise = noise.getSchema().noise;
    expect(() => Reflect.apply(noise.noise, noise, ["blue"])).toThrow(
      "[Instrument] noise() gain",
    );
    expect(noise.getSchema().noise).toEqual(previousNoise);
  });

  it("keeps supported sources and excludes narrower slots at the type boundary", () => {
    const d = new Drome();
    const envelope = d.env(0, 1);
    const lfo = d.lfo(0, 1);
    const midi = d.midi.cc(74);
    const sampler = d.sample("bd");
    const random = new RandomCycle().steps(2).range(0, 1);

    expectTypeOf(d.synth().detune(envelope)).toMatchTypeOf<
      ReturnType<Drome["synth"]>
    >();
    expectTypeOf(d.gain(envelope)).toMatchTypeOf<GainEffect>();
    expectTypeOf(d.filter("lp", envelope)).toMatchTypeOf<Filter>();
    expectTypeOf(new Filter("lp", lfo)).toMatchTypeOf<Filter>();
    expectTypeOf(d.filter("lp", midi)).toMatchTypeOf<Filter>();
    expectTypeOf(new Filter("lp", random)).toMatchTypeOf<Filter>();
    expectTypeOf(d.synth().noise(lfo)).toMatchTypeOf<
      ReturnType<Drome["synth"]>
    >();
    expectTypeOf(lfo).toMatchTypeOf<typeof lfo>();
    expectTypeOf(midi).toMatchTypeOf<typeof midi>();

    const invalid = () => {
      // @ts-expect-error Instrument gain remains numeric-or-envelope.
      d.synth().gain(lfo);
      // @ts-expect-error Instrument gain remains numeric-or-envelope.
      d.synth().gain(midi);
      // @ts-expect-error Unison voices remain numeric-only.
      d.synth("unison").voices(lfo);
      // @ts-expect-error Positional ADSR fields do not accept sources.
      d.synth().adsr(lfo, 0.2, 0.8, 0.1);
      // @ts-expect-error Positional ADSR fields do not accept arrays.
      d.synth().adsr([0.1, 0.2], 0.2, 0.8, 0.1);
      // @ts-expect-error Envelope positional ADSR fields do not accept arrays.
      new Envelope().adsr(0.1, [0.2, 0.3], 0.8, 0.1);
      d.env("0.2", 0.5);
      d.env(d.sh("0.2"), 0.5);
      new Envelope("0.2", 0.5);
      new Envelope(d.sh("0.2"), 0.5);
      d.env("0.2", "0.5");
      // @ts-expect-error Public numeric mixtures remain rejected.
      d.synth().detune(0.2, "0.4");
      // @ts-expect-error A shorthand and source cannot share one parameter slot.
      d.synth().gain("0.2", envelope);
      // @ts-expect-error Noise gain is required.
      d.synth().noise();
      // @ts-expect-error Noise gain is one single-slot value, not a raw bar.
      d.synth().noise([0.2, 0.3]);
      // @ts-expect-error Noise color and gain accept one value only.
      d.synth().noise("pink", [0.2, 0.3]);
      // @ts-expect-error Noise color and gain accept one value only.
      d.synth().noise("white", [0.2, 0.3]);
      // @ts-expect-error Noise color and gain accept one value only.
      d.synth().noise("pink", 0.2, 0.3);
      // @ts-expect-error Omitting color does not allow gain continuation.
      d.synth().noise(0.2, 0.3);
      // @ts-expect-error An explicit undefined is not omitted noise gain.
      d.synth().noise(undefined);
      // @ts-expect-error An explicit colored gain must be a value.
      d.synth().noise("pink", undefined);
      // @ts-expect-error Normalized Parameter instances are not direct sources.
      d.synth().noise(new Parameter(0.2));
      // @ts-expect-error Event string atoms are not numeric gain data.
      d.synth().noise(d.str("0.2"));
      // @ts-expect-error Filter constructor frequency is one single-slot value.
      new Filter("lp", [400, 800]);
      // @ts-expect-error Filter factory frequency is one single-slot value.
      d.filter("lp", [400, 800]);
      // @ts-expect-error Filter factory frequency does not accept continuation slots.
      d.filter("lp", 400, 800);
      // @ts-expect-error The constructor also rejects continuation slots.
      new Filter("lp", 400, 800);
      // @ts-expect-error Filter construction requires an explicit frequency.
      new Filter("lp");
      // @ts-expect-error Filter factory requires an explicit frequency.
      d.filter("lp");
      // @ts-expect-error Filter construction still requires a type selector.
      new Filter();
      // @ts-expect-error Filter factory calls still require a type selector.
      d.filter();
      // @ts-expect-error Numeric-looking event strings are not frequency data.
      d.filter("lp", d.str("400"));
      // @ts-expect-error Explicit undefined is not constructor omission.
      new Filter("lp", undefined);
      // @ts-expect-error Undefined is not an explicit filter frequency value.
      d.filter("lp", undefined);
      // @ts-expect-error Parameter instances are not public single-slot values.
      d.filter("lp", new Parameter(400));
      // @ts-expect-error Parameter instances are not public single-slot values.
      new Filter("lp", new Parameter(400));
      // @ts-expect-error Random cycles are not positional ADSR fields.
      d.synth().adsr(random, 0.2, 0.8, 0.1);
      // @ts-expect-error Random cycles are not envelope ADSR fields.
      new Envelope().adsr(0.1, random, 0.8, 0.1);
      // @ts-expect-error LFO output is excluded from envelope minimum arguments.
      d.env(lfo);
      // @ts-expect-error LFO output is excluded from envelope maximum.
      new Envelope(lfo);
      // @ts-expect-error MIDI output is excluded from envelope minimum arguments.
      d.env(midi, 0.5);
      // @ts-expect-error MIDI output is excluded from envelope maximum.
      new Envelope(midi);
      // @ts-expect-error Nested envelopes are excluded from envelope minimum arguments.
      d.env(envelope, 0.5);
      // @ts-expect-error Nested envelopes are excluded from envelope maximum.
      new Envelope(envelope);
      // @ts-expect-error Null is not a numeric envelope bound.
      d.env(null);
      // @ts-expect-error Null is not a numeric envelope minimum.
      d.env(null, 0.5);
      // @ts-expect-error Null is not a numeric envelope maximum.
      d.env(0.5, null);
      // @ts-expect-error Null is not a numeric envelope bound.
      new Envelope(null);
      // @ts-expect-error Null is not a numeric envelope maximum.
      new Envelope(0.5, null);
      // @ts-expect-error Samplers are not audio parameter sources.
      d.synth().detune(sampler);
      // @ts-expect-error A source and shorthand cannot share a filter slot.
      d.filter("lp", envelope, "0.2");
    };
    expectTypeOf(invalid).toBeFunction();
  });

  it("does not reinterpret a reusable event-only shorthand", () => {
    const eventOnly = createShorthand("0.2 ~ 0.8");
    expect(() => new GainEffect(eventOnly)).toThrow("[GainEffect] gain()");
    expect(() => new Drome().synth().detune(eventOnly)).toThrow(
      "[Instrument] detune()",
    );
  });

  it("reuses one immutable shorthand across numeric and event consumers", () => {
    const d = new Drome();
    const reusable = d.shorthand("<0.2 0.8>");
    const snapshot = structuredClone(reusable);
    const instrument = d
      .synth()
      .detune(reusable)
      .gain(reusable)
      .noise(reusable)
      .notes(reusable);
    const schema = instrument.getSchema();

    expect(schema.detune).toEqual({
      type: "static",
      cycle: [[0.2], [0.8]],
    });
    expect(schema.gain.max).toEqual(schema.detune);
    expect(schema.noise?.gain).toEqual(schema.detune);
    expect(schema.eventPattern.notes).toEqual({
      type: "static",
      cycle: [[[0.2]], [[0.8]]],
    });
    expect(schema.eventPattern.timing.cycle).toEqual([
      [{ offset: 0, duration: 1 }],
      [{ offset: 0, duration: 1 }],
    ]);
    expect(reusable).toEqual(snapshot);

    const eventOnly = d.shorthand("0.2 ~ 0.8");
    const eventOnlySnapshot = structuredClone(eventOnly);
    const prior = new Drome().synth().detune(0.75);
    const priorSchema = prior.getSchema().detune;
    expect(() => prior.detune(eventOnly)).toThrow("[Instrument] detune()");
    expect(prior.getSchema().detune).toEqual(priorSchema);
    expect(
      new Drome().synth().notes(eventOnly).getSchema().eventPattern,
    ).toEqual({
      timing: {
        cycle: [
          [
            { offset: 0, duration: 1 / 3 },
            { offset: 2 / 3, duration: 1 / 3 },
          ],
        ],
        condition: undefined,
      },
      notes: { type: "static", cycle: [[[0.2], [0.8]]] },
    });
    expect(eventOnly).toEqual(eventOnlySnapshot);
    expect(reusable).toEqual(snapshot);
  });

  it("keeps numeric NumberPattern bars independent from transformed, chance-filtered event lanes", () => {
    const source = "<[10 20] [30 40]>";
    const expected = {
      type: "static" as const,
      cycle: [
        [10, 20],
        [30, 40],
      ],
    };
    const instrument = new Drome().synth().detune(source);

    expect(instrument.getSchema().detune).toEqual(expected);

    const schema = instrument
      .notes("60 62")
      .xox(new RandomCycle().bin().steps(4).chance(0.5))
      .fast(2)
      .getSchema();

    expect(schema.detune).toEqual(expected);
    expect(schema.eventPattern.timing.condition).toMatchObject({
      type: "chance",
      probability: 0.5,
    });
  });

  it("retains random sources on supported numeric unions", () => {
    const random = new RandomCycle().steps(2).range(0, 1);
    expect(new Drome().gain(random).getSchema().gain.type).toBe(
      "random-number",
    );
    expect(new Drome().filter("lp", random).getSchema().frequency.type).toBe(
      "random-number",
    );
  });

  it("supports direct, reusable, and structured LFO endpoint patterns", () => {
    const d = new Drome();
    const direct = d.lfo("0.2 0.8", "<400 800>").getSchema();
    const reusable = d.lfo(d.sh("0.2 0.8"), d.sh("<400 800>")).getSchema();
    const structured = d.lfo(d.str(0.2, 0.8), d.str(400, 800)).getSchema();

    expect(direct.outputA).toEqual({
      type: "static",
      cycle: [[0.2, 0.8]],
    });
    expect(direct.outputB).toEqual({
      type: "static",
      cycle: [[400], [800]],
    });
    expect(reusable.outputA).toEqual(direct.outputA);
    expect(reusable.outputB).toEqual(direct.outputB);
    expect(structured.outputA).toEqual({
      type: "static",
      cycle: [[0.2], [0.8]],
    });
    expect(structured.outputB).toEqual({
      type: "static",
      cycle: [[400], [800]],
    });
  });

  it("deduplicates static LFO warnings across shared destinations", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const d = new Drome();
    const lfo = d.lfo("0.2 0.8", 1);
    d.synth().detune(lfo).push();
    d.synth().detune(lfo).push();

    d.getSchema();

    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      "[LFO] outputA bars contain multiple values; only the first value of each bar is used.",
    );
  });

  it("keeps excluded slots and narrower source permissions narrow", () => {
    const d = new Drome();
    const shorthand = d.shorthand("0.2");
    const lfo = d.lfo(0, 1);
    const midi = d.midi.cc(74);
    const sampler = d.sample("bd");
    const invalid = () => {
      d.env(shorthand, 0.5);
      // @ts-expect-error Timing generators do not accept shorthand pulses.
      d.synth().euclid(shorthand, 4);
      // @ts-expect-error Timing generators do not accept shorthand hex values.
      d.synth().hex(shorthand);
      // @ts-expect-error Timing generators do not accept shorthand sequence values.
      d.synth().sequence(shorthand, 4);
      // @ts-expect-error Sampler fit bars remain a scalar positive integer.
      sampler.fit(shorthand);
      // @ts-expect-error Chop slice count remains a scalar positive integer.
      sampler.chop(shorthand, "0 1");
      // @ts-expect-error LFO speed remains numeric-only.
      d.lfo("0.2", 1).speed("2");
      // @ts-expect-error LFO waveform remains waveform-only.
      d.lfo("0.2", 1).wave("0.5");
      // @ts-expect-error LFO phase remains scalar numeric-only.
      d.lfo("0.2", 1).offset("0.5");
      // @ts-expect-error LFO phase alias remains scalar numeric-only.
      d.lfo("0.2", 1).off(shorthand);
      // @ts-expect-error LFO endpoints accept numeric values, not raw arrays.
      d.lfo(["0.2"], 1);
      // @ts-expect-error Routing target remains a string, not a numeric pattern.
      d.synth().route(shorthand);
      // @ts-expect-error Send amount remains a scalar number.
      d.synth().send("verb", shorthand);
      // @ts-expect-error Duck depth remains a scalar number.
      d.synth().duck("verb", shorthand);
      // @ts-expect-error Duck onset remains a scalar number.
      d.synth().duck("verb", 1, shorthand);
      // @ts-expect-error Duck recovery remains a scalar number.
      d.synth().duck("verb", 1, 0, shorthand);
      // @ts-expect-error Instrument gain remains numeric-or-envelope.
      d.synth().gain(lfo);
      // @ts-expect-error Instrument gain remains numeric-or-envelope.
      d.synth().gain(midi);
      // @ts-expect-error Unison voices remain numeric-only.
      d.synth("uni").voices(lfo);
      // @ts-expect-error Positional ADSR fields do not accept sources.
      d.synth().adsr(lfo, 0.2, 0.8, 0.1);
      // @ts-expect-error Samplers are not audio parameter sources.
      d.synth().detune(sampler);
    };
    expectTypeOf(invalid).toBeFunction();
  });

  it("supports direct, reusable, and structured sampler region patterns", () => {
    const d = new Drome();
    const inputs = numericInputs(d, "0.2 0.8");

    for (const { input } of inputs) {
      const sampler = new Sampler("bd").start(...input).end(...input);
      expect(sampler.getSchema().region).toEqual({
        type: "static",
        start: { type: "static", cycle: [[0.2, 0.8]] },
        end: { type: "static", cycle: [[0.2, 0.8]] },
      });

      const duration = new Sampler("bd").duration(...input).getSchema().region;
      expect(duration).toEqual({
        type: "static",
        start: { type: "static", cycle: [[0]] },
        duration: { type: "static", cycle: [[0.2, 0.8]] },
      });
      expect(new Sampler("bd").dur(...input).getSchema().region).toEqual(
        duration,
      );
    }

    const multibar = new Sampler("bd").start("<0.2 0.8>").end(d.sh("<0.4 1>"));
    expect(multibar.getSchema().region).toEqual({
      type: "static",
      start: { type: "static", cycle: [[0.2], [0.8]] },
      end: { type: "static", cycle: [[0.4], [1]] },
    });
  });

  it("matches authored chop shorthand schemas and timing, including fit order", () => {
    const d = new Drome();
    const inputs = numericInputs(d, "0 2 1 3", [0, 2, 1, 3]);
    const expectedRegion = {
      type: "chop",
      slices: [
        { start: 0, end: 0.25 },
        { start: 0.25, end: 0.5 },
        { start: 0.5, end: 0.75 },
        { start: 0.75, end: 1 },
      ],
      sequence: { type: "static", cycle: [[0, 2, 1, 3]] },
    };

    for (const { input } of inputs) {
      const sampler = new Sampler("bd").chop(4, ...input);
      expect(sampler.getSchema().region).toEqual(expectedRegion);
      expect(sampler.getSchema().eventPattern.timing.cycle).toEqual([
        [
          { offset: 0, duration: 0.25 },
          { offset: 0.25, duration: 0.25 },
          { offset: 0.5, duration: 0.25 },
          { offset: 0.75, duration: 0.25 },
        ],
      ]);
    }

    const beforeFit = new Sampler("bd").fit(2).chop(4, "0 2 1 3").getSchema();
    const afterFit = new Sampler("bd").chop(4, "0 2 1 3").fit(2).getSchema();
    expect(beforeFit.region).toEqual(expectedRegion);
    expect(afterFit.region).toEqual(expectedRegion);
    expect(afterFit.eventPattern.timing).toEqual(beforeFit.eventPattern.timing);

    const multibarInputs = [
      ["<0 2 1 3>"],
      [d.sh("<0 2 1 3>")],
      [[0], [2], [1], [3]],
    ] satisfies NumericPatternInput[];
    for (const input of multibarInputs) {
      const multibar = new Sampler("bd").chop(4, ...input).getSchema();
      expect(multibar.region).toMatchObject({
        sequence: { type: "static", cycle: [[0], [2], [1], [3]] },
      });
      expect(multibar.eventPattern.timing.cycle).toEqual(
        Array.from({ length: 4 }, () => [{ offset: 0, duration: 1 }]),
      );
    }
  });

  it("rejects sampler shorthand misuse without replacing region or chop state", () => {
    const region = new Sampler("bd").start(0.2).end(0.8);
    const regionBefore = region.getSchema().region;
    for (const input of [
      ["0.2 ~ 0.8"],
      [0.2, "0.8"],
      ["[0.2, 0.8]"],
    ] as const) {
      expect(() => Reflect.apply(region.end, region, input)).toThrow(
        "[Sampler] end()",
      );
      expect(region.getSchema().region).toEqual(regionBefore);
    }

    const chop = new Sampler("bd").chop(4, "0 2 1 3");
    const chopBefore = chop.getSchema();
    for (const input of ["0 ~ 1", "[0, 1]"] as const) {
      expect(() => chop.chop(4, input)).toThrow("[Sampler] chop() sequence");
      expect(chop.getSchema()).toEqual(chopBefore);
    }
  });

  it("retains sampler region validation stages and chop restrictions", () => {
    const outOfRange = new Sampler("bd").start("1.1");
    expect(() => outOfRange.getSchema()).toThrow(
      "[Sampler] start() values must be finite numbers in [0, 1].",
    );

    expect(() => new Sampler("bd").duration("0.2").chop(4).getSchema()).toThrow(
      "[Sampler] duration() cannot be used with chop().",
    );
  });

  it("keeps sampler scalar and excluded signatures narrow", () => {
    const d = new Drome();
    const sampler = d.sample("bd");
    const invalid = () => {
      // @ts-expect-error chop sliceCount remains a scalar positive integer.
      sampler.chop("4", "0 1");
      // @ts-expect-error chop sliceCount does not accept reusable shorthand.
      sampler.chop(d.sh("4"), "0 1");
      // @ts-expect-error Region slots reject mixed whole-pattern arguments.
      sampler.start(0.2, "0.8");
      // @ts-expect-error The dur alias has the same numeric-pattern contract.
      sampler.dur(0.2, d.sh("0.8"));
    };
    expectTypeOf(invalid).toBeFunction();
  });
});
