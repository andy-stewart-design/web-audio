import { RandomCycle } from "@web-audio/patterns";
import { describe, expect, expectTypeOf, it } from "vitest";
import Drome from "@/drome";
import Envelope from "@/automations/envelope";
import Filter from "@/effects/filter";
import Lfo from "@/automations/lfo";
import Parameter from "@/parameters/parameter";
import Sampler from "@/instruments/sampler";
import type { NumericPatternValue } from "@/inputs/types";

type PositionalCase = {
  label: string;
  baseArgs: readonly unknown[];
  patternIndex: number;
  maxArgs: number;
  extraArgs?: readonly unknown[];
  allowsUndefinedSlot?: boolean;
  invoke: (args: unknown[]) => unknown;
};

function constructorCase(
  label: string,
  target: typeof Envelope | typeof Filter | typeof Lfo,
  baseArgs: readonly unknown[],
  patternIndex: number,
  maxArgs: number,
  options: Pick<PositionalCase, "extraArgs" | "allowsUndefinedSlot"> = {},
): PositionalCase {
  return {
    label,
    baseArgs,
    patternIndex,
    maxArgs,
    ...options,
    invoke: (args) => Reflect.construct(target, args),
  };
}

function positionalCases(d: Drome): PositionalCase[] {
  const noise = d.synth();
  const adsrEnvelope = new Envelope().adsr(0.1, 0.2, 0.8, 0.05);
  const adsrInstrument = d.synth().adsr(0.1, 0.2, 0.8, 0.05);
  const sampler = new Sampler("bd");

  return [
    {
      label: "noise gain",
      baseArgs: [0.2],
      patternIndex: 0,
      maxArgs: 1,
      invoke: (args) => Reflect.apply(noise.noise, noise, args),
    },
    {
      label: "noise color and gain",
      baseArgs: ["pink", 0.2],
      patternIndex: 1,
      maxArgs: 2,
      invoke: (args) => Reflect.apply(noise.noise, noise, args),
    },
    constructorCase("filter constructor frequency", Filter, ["lp", 400], 1, 2),
    {
      label: "filter factory frequency",
      baseArgs: ["lp", 400],
      patternIndex: 1,
      maxArgs: 2,
      invoke: (args) => Reflect.apply(d.filter, d, args),
    },
    constructorCase("LFO constructor output A", Lfo, [0.2, 0.8], 0, 2),
    constructorCase("LFO constructor output B", Lfo, [0.2, 0.8], 1, 2),
    {
      label: "LFO factory output A",
      baseArgs: [0.2, 0.8],
      patternIndex: 0,
      maxArgs: 2,
      invoke: (args) => Reflect.apply(d.lfo, d, args),
    },
    {
      label: "LFO factory output B",
      baseArgs: [0.2, 0.8],
      patternIndex: 1,
      maxArgs: 2,
      invoke: (args) => Reflect.apply(d.lfo, d, args),
    },
    ...[0, 1, 2, 3].flatMap((patternIndex) => [
      {
        label: `Envelope ADSR field ${patternIndex}`,
        baseArgs: [0.1, 0.2, 0.8, 0.05],
        patternIndex,
        maxArgs: 4,
        invoke: (args: unknown[]) =>
          Reflect.apply(adsrEnvelope.adsr, adsrEnvelope, args),
      },
      {
        label: `Instrument ADSR field ${patternIndex}`,
        baseArgs: [0.1, 0.2, 0.8, 0.05],
        patternIndex,
        maxArgs: 4,
        invoke: (args: unknown[]) =>
          Reflect.apply(adsrInstrument.adsr, adsrInstrument, args),
      },
    ]),
    constructorCase(
      "Envelope constructor sole maximum",
      Envelope,
      [0.2],
      0,
      1,
      {
        extraArgs: [0.2, 0.8, 1],
        allowsUndefinedSlot: true,
      },
    ),
    constructorCase("Envelope constructor minimum", Envelope, [0.2, 0.8], 0, 2),
    constructorCase("Envelope constructor maximum", Envelope, [0.2, 0.8], 1, 2),
    {
      label: "Envelope factory sole maximum",
      baseArgs: [0.2],
      patternIndex: 0,
      maxArgs: 1,
      extraArgs: [0.2, 0.8, 1],
      allowsUndefinedSlot: true,
      invoke: (args) => Reflect.apply(d.env, d, args),
    },
    {
      label: "Envelope factory minimum",
      baseArgs: [0.2, 0.8],
      patternIndex: 0,
      maxArgs: 2,
      invoke: (args) => Reflect.apply(d.env, d, args),
    },
    {
      label: "Envelope factory maximum",
      baseArgs: [0.2, 0.8],
      patternIndex: 1,
      maxArgs: 2,
      invoke: (args) => Reflect.apply(d.env, d, args),
    },
    {
      label: "sampler chop sequence",
      baseArgs: [4, 0],
      patternIndex: 1,
      maxArgs: 2,
      invoke: (args) => Reflect.apply(sampler.chop, sampler, args),
    },
  ];
}

describe("phase 3 positional pattern input boundaries", () => {
  it("rejects raw, nested, null, undefined, and wrapped malformed slots", () => {
    const d = new Drome();
    const wrappedInvalid = [d.str("0 1"), d.str(null), d.str([[0]])];

    for (const testCase of positionalCases(d)) {
      const invalidValues = testCase.allowsUndefinedSlot
        ? [[0, 1], [[0, 1]], null, ...wrappedInvalid]
        : [[0, 1], [[0, 1]], null, undefined, ...wrappedInvalid];
      for (const value of invalidValues) {
        const args = [...testCase.baseArgs];
        args[testCase.patternIndex] = value;
        expect(
          () => testCase.invoke(args),
          `${testCase.label} with ${String(value)}`,
        ).toThrow();
      }
    }
  });

  it("rejects arguments beyond each fixed public arity", () => {
    const d = new Drome();

    for (const testCase of positionalCases(d)) {
      const extra = [...(testCase.extraArgs ?? [...testCase.baseArgs, 99])];
      expect(
        () => testCase.invoke(extra),
        `${testCase.label} accepted an extra argument`,
      ).toThrow();
      expect(extra.length).toBeGreaterThan(testCase.maxArgs);
    }
  });

  it("rejects missing fixed slots while preserving envelope one-argument defaults", () => {
    const d = new Drome();
    const missing = positionalCases(d).filter(
      (testCase) =>
        !testCase.label.startsWith("Envelope constructor") &&
        !testCase.label.startsWith("Envelope factory") &&
        !testCase.label.startsWith("sampler chop"),
    );

    for (const testCase of missing) {
      const args = testCase.baseArgs.slice(0, -1);
      expect(
        () => testCase.invoke(args),
        `${testCase.label} accepted a missing slot`,
      ).toThrow();
    }

    expect(new Envelope().getSchema().min).toEqual({
      type: "static",
      cycle: [[0]],
    });
    expect(d.env(undefined).getSchema().max).toEqual({
      type: "static",
      cycle: [[1]],
    });
    expect(new Envelope(0.8).getSchema().max).toEqual({
      type: "static",
      cycle: [[0.8]],
    });
  });

  it("rejects invalid chop counts and forbidden positional sources", () => {
    const d = new Drome();
    const sampler = new Sampler("bd");
    for (const args of [
      [],
      [0],
      [1.5],
      [Number.NaN],
      [16_385],
      [4, undefined],
      [4, null],
      [4, d.env()],
      [4, d.lfo(0, 1)],
      [4, d.midi.cc(74)],
      [4, new Parameter(0.2)],
    ]) {
      expect(() => Reflect.apply(sampler.chop, sampler, args)).toThrow();
    }

    const random = new RandomCycle().steps(2);
    const envelope = new Envelope();
    const lfo = d.lfo(0, 1);
    const midi = d.midi.cc(74);
    const probes = () => {
      // @ts-expect-error Chop accepts one optional numeric pattern value, not raw arrays.
      sampler.chop(4, [0, 1]);
      // @ts-expect-error Chop rejects extra positional arguments.
      sampler.chop(4, 0, 1);
      // @ts-expect-error Chop requires a slice count.
      sampler.chop();
      sampler.chop(4, undefined);
      // @ts-expect-error Chop rejects envelope sources.
      sampler.chop(4, envelope);
      // @ts-expect-error Chop rejects LFO sources.
      sampler.chop(4, lfo);
      // @ts-expect-error Chop rejects MIDI sources.
      sampler.chop(4, midi);
      // @ts-expect-error Chop rejects Parameter wrappers.
      sampler.chop(4, new Parameter(0.2));
      sampler.chop(4, random);
    };
    expectTypeOf(probes).toBeFunction();
  });

  it("retains valid explicit slots and deliberate dedicated-setter sugar", () => {
    const d = new Drome();
    expect(new Envelope(d.str(0.2), d.sh("0.8")).getSchema().max).toEqual({
      type: "static",
      cycle: [[0.8]],
    });
    expect(d.lfo(d.str(0.2), d.sh("0.8")).getSchema().outputA).toEqual({
      type: "static",
      cycle: [[0.2]],
    });
    expect(d.filter("lp", d.str(400)).getSchema().frequency).toEqual({
      type: "static",
      cycle: [[400]],
    });
    expect(d.synth().noise(d.str(0.2)).getSchema().noise).toMatchObject({
      color: "white",
    });

    expect(d.synth().gain(0.2, 0.4).getSchema().gain.max).toEqual({
      type: "static",
      cycle: [[0.2], [0.4]],
    });
    expect(new Envelope().max(0.2, 0.4).getSchema().max).toEqual({
      type: "static",
      cycle: [[0.2], [0.4]],
    });
    expect(new Filter("lp", 400).q(1, 2).getSchema().q).toEqual({
      type: "static",
      cycle: [[1], [2]],
    });
    expect(d.lpf(400, 800).getSchema().frequency).toEqual({
      type: "static",
      cycle: [[400], [800]],
    });
    expect(d.sample("bd").start(0.1, 0.2).getSchema().region).toMatchObject({
      type: "static",
      start: { type: "static", cycle: [[0.1], [0.2]] },
    });
    expect(d.sample("bd").end(0.8, 0.9).getSchema().region).toMatchObject({
      type: "static",
      start: { type: "static", cycle: [[0]] },
      end: { type: "static", cycle: [[0.8], [0.9]] },
    });
    expect(d.sample("bd").duration(0.2, 0.3).getSchema().region).toMatchObject({
      type: "static",
      start: { type: "static", cycle: [[0]] },
      duration: { type: "static", cycle: [[0.2], [0.3]] },
    });
    expect(d.sample("bd").dur(0.2, 0.3).getSchema().region).toMatchObject({
      type: "static",
      duration: { type: "static", cycle: [[0.2], [0.3]] },
    });
  });

  it("keeps simple optional positional signatures in the type surface", () => {
    expectTypeOf<ConstructorParameters<typeof Envelope>>().toEqualTypeOf<
      [minOrMax?: NumericPatternValue, maximum?: NumericPatternValue]
    >();
    expectTypeOf<Parameters<Drome["env"]>>().toEqualTypeOf<
      [minOrMax?: NumericPatternValue, maximum?: NumericPatternValue]
    >();
    expectTypeOf<Parameters<Sampler["chop"]>>().toEqualTypeOf<
      [sliceCount: number, sequence?: NumericPatternValue]
    >();
  });

  it("keeps fixed signatures in the runtime surface", () => {
    const d = new Drome();
    expect(Envelope).toHaveLength(2);
    expect(d.env).toHaveLength(2);
    expect(new Sampler("bd").chop).toHaveLength(2);
    const random = new RandomCycle().steps(2);
    const nested = new Envelope();
    const lfo = d.lfo(0, 1);
    const midi = d.midi.cc(74);
    const parameter = new Parameter(0.2);
    const probes = () => {
      // @ts-expect-error Envelope constructor rejects a sole raw array.
      new Envelope([0, 1]);
      // @ts-expect-error Envelope constructor rejects a raw minimum array.
      new Envelope([0, 1], 0.8);
      // @ts-expect-error Envelope constructor rejects a raw maximum array.
      new Envelope(0.2, [0, 1]);
      // @ts-expect-error Envelope constructor rejects more than two arguments.
      new Envelope(0.2, 0.8, 1);
      new Envelope(undefined, 0.8);
      // @ts-expect-error Envelope factory rejects a sole raw array.
      d.env([0, 1]);
      // @ts-expect-error Envelope factory rejects a raw minimum array.
      d.env([0, 1], 0.8);
      // @ts-expect-error Envelope factory rejects a raw maximum array.
      d.env(0.2, [0, 1]);
      // @ts-expect-error Envelope factory rejects more than two arguments.
      d.env(0.2, 0.8, 1);
      d.env(undefined, 0.8);
      // @ts-expect-error Noise rejects raw arrays as a single slot.
      d.synth().noise([0, 1]);
      // @ts-expect-error Filter rejects raw arrays as its fixed frequency slot.
      d.filter("lp", [400, 800]);
      // @ts-expect-error LFO rejects raw arrays at either endpoint.
      d.lfo([0, 1], 0.8);
      // @ts-expect-error ADSR rejects raw arrays in every positional field.
      d.synth().adsr(0.1, [0.2, 0.3], 0.8, 0.05);
      // @ts-expect-error Envelope bounds reject nested audio sources.
      new Envelope(nested, 0.8);
      // @ts-expect-error Envelope bounds reject LFO sources.
      new Envelope(lfo, 0.8);
      // @ts-expect-error Envelope bounds reject MIDI sources.
      new Envelope(midi, 0.8);
      // @ts-expect-error Envelope bounds reject Parameter wrappers.
      new Envelope(parameter, 0.8);
      new Envelope(random, 0.8);
    };
    expectTypeOf(probes).toBeFunction();
  });
});
