import {
  createShorthand,
  createStructuredInput,
  RandomCycle,
} from "@web-audio/patterns";
import type { NumberPattern } from "@web-audio/schema";
import Drome from "@/drome";
import Parameter from "@/parameters/parameter";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import Envelope from "../envelope";

function staticCycle(pattern: NumberPattern) {
  expect(pattern.type).toBe("static");
  if (pattern.type !== "static") throw new Error("Expected static pattern");
  return pattern.cycle;
}

describe("Envelope", () => {
  it("serializes value-only defaults, including zero", () => {
    const schema = new Envelope().getSchema();

    expect(schema).toEqual({
      type: "envelope",
      min: { type: "static", cycle: [[0]] },
      max: { type: "static", cycle: [[1]] },
      a: { type: "static", cycle: [[0.01]] },
      d: { type: "static", cycle: [[0]] },
      s: { type: "static", cycle: [[1]] },
      r: { type: "static", cycle: [[0.01]] },
      mode: "bleed",
    });
  });

  it("requires exactly four ADSR values at both public boundaries", () => {
    const d = new Drome();
    const envelope = new Envelope();
    const instrument = d.synth();
    expect(envelope.adsr).toHaveLength(4);
    expect(instrument.adsr).toHaveLength(4);
    for (const args of [
      [],
      [0.1],
      [0.1, 0.2],
      [0.1, 0.2, 0.8],
      [0.1, 0.2, 0.8, 0.1, 1],
    ]) {
      expect(() => Reflect.apply(envelope.adsr, envelope, args)).toThrow();
      expect(() => Reflect.apply(instrument.adsr, instrument, args)).toThrow();
    }
  });

  it("serializes every ADSR field exactly for both envelope and instrument wrappers", () => {
    const d = new Drome();
    const wrappers = [
      0.2,
      "0.2 0.4",
      createShorthand("0.2 0.4"),
      createStructuredInput(0.2, 0.4),
    ] as const;

    for (const value of wrappers) {
      const expected =
        typeof value === "number"
          ? [[value]]
          : typeof value === "object" && value !== null && "values" in value
            ? [[0.2], [0.4]]
            : [[0.2, 0.4]];
      const envelope = new Envelope().adsr(value, value, value, value);
      const instrument = d.synth().adsr(value, value, value, value);
      for (const field of ["a", "d", "s", "r"] as const) {
        expect(envelope.getSchema()[field]).toEqual({
          type: "static",
          cycle: expected,
        });
        expect(instrument.getSchema().gain[field]).toEqual({
          type: "static",
          cycle: expected,
        });
      }
    }

    const mixed = new Envelope().adsr(
      0.1,
      "0.2 0.3",
      createShorthand("0.8 0.9"),
      createStructuredInput(0.4, 0.5),
    );
    expect(mixed.getSchema().a).toEqual({ type: "static", cycle: [[0.1]] });
    expect(mixed.getSchema().d).toEqual({
      type: "static",
      cycle: [[0.2, 0.3]],
    });
    expect(mixed.getSchema().s).toEqual({
      type: "static",
      cycle: [[0.8, 0.9]],
    });
    expect(mixed.getSchema().r).toEqual({
      type: "static",
      cycle: [[0.4], [0.5]],
    });
  });

  it("snapshots shared factory inputs and keeps reusable inputs safe across actors", () => {
    const d = new Drome();
    const original = [0.2, 0.4];
    const structured = d.str(original);
    const reusable = d.sh("0.6 0.8");
    const envelope = new Envelope().adsr(
      structured,
      reusable,
      structured,
      reusable,
    );
    const instrument = d
      .synth()
      .adsr(structured, reusable, structured, reusable);
    original[0] = 1;

    expect(envelope.getSchema().a).toEqual({
      type: "static",
      cycle: [[0.2, 0.4]],
    });
    expect(instrument.getSchema().gain).toEqual(envelope.getSchema());
    expect(envelope.getSchema().d).toEqual({
      type: "static",
      cycle: [[0.6, 0.8]],
    });
  });

  it("keeps constructor and factory defaults and bound meanings exactly in parity", () => {
    const d = new Drome();
    expect(d.env().getSchema()).toEqual(new Envelope().getSchema());
    expect(d.env(undefined).getSchema()).toEqual(
      new Envelope(undefined).getSchema(),
    );

    const values = [0.25, "0.2 0.4", d.sh("0.2 0.4"), d.str(0.2, 0.4)] as const;
    for (const value of values) {
      expect(d.env(value).getSchema()).toEqual(new Envelope(value).getSchema());
      expect(d.env(value).getSchema().min).toEqual({
        type: "static",
        cycle: [[0]],
      });
    }

    const bounds = [
      [0.1, 0.8],
      [d.sh("0.1 0.2"), d.str(0.8, 0.9)],
    ] as const;
    for (const [minimum, maximum] of bounds) {
      expect(d.env(minimum, maximum).getSchema()).toEqual(
        new Envelope(minimum, maximum).getSchema(),
      );
    }
  });

  it("serializes custom min and multi-bar max values", () => {
    const schema = new Envelope(
      0.1,
      createStructuredInput([0.75, 1.25], [0.25, 0.5]),
    ).getSchema();

    expect(schema.min).toEqual({ type: "static", cycle: [[0.1]] });
    expect(schema.max).toEqual({
      type: "static",
      cycle: [
        [0.75, 1.25],
        [0.25, 0.5],
      ],
    });
  });

  it("rejects undefined in every multi-field envelope position", () => {
    const d = new Drome();
    const invalid: unknown[][] = [
      [undefined, 0.25],
      [0.1, undefined],
      [undefined, undefined],
      [undefined, "0.8"],
      [undefined, d.sh("0.8")],
      [undefined, d.str(0.8)],
      [undefined, d.rand()],
    ];

    for (const args of invalid) {
      expect(() => Reflect.construct(Envelope, args)).toThrow();
      expect(() => Reflect.apply(d.env, d, args)).toThrow();
    }
  });

  it("uses a sole numeric argument as the maximum", () => {
    expect(new Envelope(0.25).getSchema()).toMatchObject({
      min: { type: "static", cycle: [[0]] },
      max: { type: "static", cycle: [[0.25]] },
    });
  });

  it("serializes patterned minimum values through the Parameter model", () => {
    const d = new Drome();
    const schema = new Envelope(d.str([0.1, 0.2]), d.str(0.8, 1)).getSchema();

    expect(schema.min).toEqual({
      type: "static",
      cycle: [[0.1, 0.2]],
    });
    expect(schema.max).toEqual({
      type: "static",
      cycle: [[0.8], [1]],
    });
  });

  it("rejects nested audio sources as minimum values", () => {
    const d = new Drome();

    expect(() => Reflect.construct(Envelope, [d.env(), 1])).toThrow(
      "constructor minimum input must be a number, shorthand, structured input, or random cycle",
    );
    expect(() => Reflect.construct(Envelope, [d.lfo(0, 1), 1])).toThrow(
      "constructor minimum input must be a number, shorthand, structured input, or random cycle",
    );
    expect(() => Reflect.construct(Envelope, [d.midi.cc(74), 1])).toThrow(
      "constructor minimum input must be a number, shorthand, structured input, or random cycle",
    );
  });

  it("accepts multivalue structured bars for both bounds and rejects invalid bound shapes", () => {
    const d = new Drome();
    const chord = d.str([0.1, 0.2]);
    const valid = new Envelope(chord, d.str([0.8, 0.9])).getSchema();
    expect(valid.min).toEqual({ type: "static", cycle: [[0.1, 0.2]] });
    expect(valid.max).toEqual({ type: "static", cycle: [[0.8, 0.9]] });

    const invalidBounds: unknown[] = [
      [0.1, 0.2],
      d.env(),
      d.lfo(0, 1),
      d.midi.cc(74),
      d.str(null),
      d.str(["0.2"]),
      "0.2 ~ 0.8",
    ];
    for (const bound of invalidBounds) {
      expect(() => Reflect.construct(Envelope, [bound])).toThrow();
      expect(() => Reflect.construct(Envelope, [bound, 1])).toThrow();
    }

    expect(() => Reflect.construct(Envelope, [0, "0.2", 0.8])).toThrow();
    expect(() => Reflect.construct(Envelope, [0, ["0.2", 0.8]])).toThrow();
  });

  it("rejects invalid static bounds before construction or factory return", () => {
    const d = new Drome();
    const invalid: [string, unknown[]][] = [
      ["minimum", [Number.NaN, 1]],
      ["minimum", [Number.POSITIVE_INFINITY, 1]],
      ["minimum", [Number.NEGATIVE_INFINITY, 1]],
      ["max", [Number.NaN]],
      ["max", [Number.POSITIVE_INFINITY]],
      ["max", [Number.NEGATIVE_INFINITY]],
      ["max", [0, Number.NaN]],
      ["max", [0, Number.POSITIVE_INFINITY]],
      ["max", [0, Number.NEGATIVE_INFINITY]],
      ["max", [0, [Number.NaN]]],
      ["max", [0, d.env()]],
      ["max", [0, d.lfo(0, 1)]],
      ["max", [0, d.midi.cc(74)]],
      ["max", [0, []]],
    ];

    for (const [field, args] of invalid) {
      expect(() => Reflect.construct(Envelope, args), String(args)).toThrow(
        field,
      );
      expect(() => Reflect.apply(d.env, d, args), String(args)).toThrow(field);
    }
  });

  it("does not eagerly read random bounds during construction", () => {
    const d = new Drome();
    const random = d.rand().steps(2, 0, 4).range(0.25, 1);
    const getRandomSchema = vi.spyOn(random, "getRandomSchema");

    const factory = d.env(0, random);
    const constructor = new Envelope(0, random);
    expect(getRandomSchema).not.toHaveBeenCalled();
    expect(factory.getSchema().max).toEqual(constructor.getSchema().max);
  });

  it("keeps both random bounds lazy and equivalent across public boundaries", () => {
    const d = new Drome();
    const minimum = d.rand().steps(2, 0, 4).range(0.1, 0.3);
    const maximum = d.rand().steps(1, 3, 2).range(0.7, 1);
    const getMinimumSchema = vi.spyOn(minimum, "getRandomSchema");
    const getMaximumSchema = vi.spyOn(maximum, "getRandomSchema");

    const factory = d.env(minimum, maximum);
    const constructor = new Envelope(minimum, maximum);
    expect(getMinimumSchema).not.toHaveBeenCalled();
    expect(getMaximumSchema).not.toHaveBeenCalled();
    expect(factory.getSchema()).toEqual(constructor.getSchema());
  });

  it("serializes random max values without timing geometry", () => {
    const schema = new Envelope(
      0,
      new RandomCycle().steps(2, 0, 4).range(0.25, 1),
    ).getSchema();

    expect(schema.max).toMatchObject({
      type: "random-number",
      valuesPerBar: [2, 0, 4],
      range: { min: 0.25, max: 1 },
    });
    expect(schema.max).not.toHaveProperty("grid");
  });

  it("updates max without replacing ADSR or mode", () => {
    const schema = new Envelope()
      .adsr(0.5, 0.25, 0.8, 0.1)
      .mode("bounded")
      .max(0.75)
      .getSchema();

    expect(schema.max).toEqual({ type: "static", cycle: [[0.75]] });
    expect(schema.a).toEqual({ type: "static", cycle: [[0.5]] });
    expect(schema.mode).toBe("bounded");
  });

  it("does not replace a bound after invalid max candidates", () => {
    const envelope = new Envelope(0.25, 0.75)
      .adsr(0.5, 0.25, 0.8, 0.1)
      .mode("bounded");
    const before = envelope.getSchema();

    for (const input of [
      [Number.NaN],
      [Number.POSITIVE_INFINITY],
      [[Number.NaN]],
    ]) {
      expect(() => Reflect.apply(envelope.max, envelope, input)).toThrow(
        "[Envelope] max()",
      );
      expect(envelope.getSchema()).toEqual(before);
    }
  });

  it("resets max to one when called without input", () => {
    expect(new Envelope(0, 0.25).max().getSchema().max).toEqual({
      type: "static",
      cycle: [[1]],
    });
  });

  it("sets all ADSR values as value-only patterns", () => {
    const schema = new Envelope().adsr(0.5, 0.25, 0.8, 0.1).getSchema();

    expect(schema.a).toEqual({ type: "static", cycle: [[0.5]] });
    expect(schema.d).toEqual({ type: "static", cycle: [[0.25]] });
    expect(schema.s).toEqual({ type: "static", cycle: [[0.8]] });
    expect(schema.r).toEqual({ type: "static", cycle: [[0.1]] });
  });

  it("accepts shorthand value sequences for each ADSR parameter", () => {
    const schema = new Envelope()
      .adsr("0.2 0.4", "0.1 0.2", "0.8 0.6", "0.05 0.1")
      .getSchema();

    expect(staticCycle(schema.a)).toEqual([[0.2, 0.4]]);
    expect(staticCycle(schema.d)).toEqual([[0.1, 0.2]]);
    expect(staticCycle(schema.s)).toEqual([[0.8, 0.6]]);
    expect(staticCycle(schema.r)).toEqual([[0.05, 0.1]]);
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["NaN", Number.NaN],
    ["non-numeric", true],
  ])("rejects invalid positional %s values atomically", (_label, value) => {
    const envelope = new Envelope().adsr(0.1, 0.2, 0.8, 0.1);
    const before = envelope.getSchema();

    expect(() =>
      Reflect.apply(envelope.adsr, envelope, [value, 0.2, 0.8, 0.1]),
    ).toThrow();
    expect(envelope.getSchema()).toEqual(before);
  });

  it("rejects positional arrays before replacing any ADSR field", () => {
    const baseline = [0.1, 0.2, 0.8, 0.1];

    for (const index of [0, 1, 2, 3]) {
      const envelope = new Envelope().adsr(
        baseline[0],
        baseline[1],
        baseline[2],
        baseline[3],
      );
      const before = envelope.getSchema();
      const invalid: unknown[] = [...baseline];
      invalid[index] = [0.2, 0.4];

      expect(() => Reflect.apply(envelope.adsr, envelope, invalid)).toThrow(
        "positional arrays are not supported",
      );
      expect(envelope.getSchema()).toEqual(before);
    }
  });

  it("rejects every invalid ADSR value at every position without mutating either wrapper", () => {
    const d = new Drome();
    const invalid: unknown[] = [
      undefined,
      null,
      true,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      [0.2, 0.4],
      [[0.2, 0.4]],
      d.env(),
      d.lfo(0, 1),
      d.midi.cc(74),
      new Parameter(0.2),
      new RandomCycle().steps(2),
      "0.2 ~ 0.8",
      "",
      d.str("0.2"),
      d.str(null),
      d.str([[0.2, 0.4]]),
      d.str([]),
    ];
    const baseline = [0.1, 0.2, 0.8, 0.05] as const;
    const fields = ["_min", "_max", "_a", "_d", "_s", "_r"] as const;

    for (const index of [0, 1, 2, 3]) {
      for (const value of invalid) {
        const envelope = new Envelope(d.str(0.05, 0.1), d.str(1.2, 0.9))
          .adsr(...baseline)
          .mode("bounded");
        const beforeEnvelope = envelope.getSchema();
        const previousParameters = fields.map((field) =>
          Reflect.get(envelope, field),
        );
        const args: unknown[] = [...baseline];
        args[index] = value;
        expect(() => Reflect.apply(envelope.adsr, envelope, args)).toThrow();
        expect(envelope.getSchema()).toEqual(beforeEnvelope);
        fields.forEach((field, fieldIndex) => {
          expect(Reflect.get(envelope, field)).toBe(
            previousParameters[fieldIndex],
          );
        });

        const gain = new Envelope(d.str(0.01, 0.02), d.str(0.9, 0.7)).mode(
          "bounded",
        );
        const instrument = d
          .synth()
          .gain(gain)
          .adsr(...baseline);
        const beforeGain = instrument.getSchema().gain;
        const previousGainParameters = fields.map((field) =>
          Reflect.get(gain, field),
        );
        expect(() =>
          Reflect.apply(instrument.adsr, instrument, args),
        ).toThrow();
        expect(instrument.getSchema().gain).toEqual(beforeGain);
        expect(Reflect.get(instrument, "_gain")).toBe(gain);
        fields.forEach((field, fieldIndex) => {
          expect(Reflect.get(gain, field)).toBe(
            previousGainParameters[fieldIndex],
          );
        });
      }
    }
  });

  it("does not inspect an existing random maximum while validating ADSR changes", () => {
    const d = new Drome();
    const random = new RandomCycle().steps(2).range(0, 1);
    const envelope = new Envelope(0, random);
    const getRandomSchema = vi.spyOn(random, "getRandomSchema");
    expect(() => envelope.adsr(0.1, 0.2, "0.2 ~", 0.1)).toThrow();
    expect(getRandomSchema).not.toHaveBeenCalled();

    const staticEnvelope = new Envelope(0, random).adsr(0.1, 0.2, 0.8, 0.1);
    expect(getRandomSchema).not.toHaveBeenCalled();
    expect(staticEnvelope.getSchema().max.type).toBe("random-number");

    const instrumentRandom = new RandomCycle().steps(3);
    const instrument = d.synth().gain(instrumentRandom);
    const instrumentRandomSchema = vi.spyOn(
      instrumentRandom,
      "getRandomSchema",
    );
    expect(() => instrument.adsr(0.1, 0.2, "0.2 ~", 0.1)).toThrow();
    expect(instrumentRandomSchema).not.toHaveBeenCalled();
    instrument.adsr(0.1, 0.2, 0.8, 0.1);
    expect(instrumentRandomSchema).not.toHaveBeenCalled();
  });

  it("keeps dedicated ADSR setters variadic and their direct random inputs live", () => {
    for (const field of ["a", "d", "s", "r"] as const) {
      const envelope = new Envelope();
      envelope[field]([0.1, 0.2], 0.3);
      expect(envelope.getSchema()[field]).toEqual({
        type: "static",
        cycle: [[0.1, 0.2], [0.3]],
      });

      const random = new RandomCycle().steps(2).range(0.1, 0.4);
      const control = new RandomCycle().steps(2).range(0.1, 0.4);
      const schema = vi.spyOn(random, "getRandomSchema");
      envelope[field](random);
      expect(schema).not.toHaveBeenCalled();
      random.steps(3).range(0.2, 0.6);
      control.steps(3).range(0.2, 0.6);
      expect(envelope.getSchema()[field]).toEqual(control.getRandomSchema());
    }
  });

  it("individual setters override ADSR fields", () => {
    const schema = new Envelope()
      .adsr(0.5, 0.25, 0.8, 0.1)
      .a(0.9)
      .d(0.7)
      .s(0.3)
      .r(0.6)
      .getSchema();

    expect(staticCycle(schema.a)).toEqual([[0.9]]);
    expect(staticCycle(schema.d)).toEqual([[0.7]]);
    expect(staticCycle(schema.s)).toEqual([[0.3]]);
    expect(staticCycle(schema.r)).toEqual([[0.6]]);
  });

  it("uses last-write-wins semantics between ADSR and individual setters", () => {
    const schema = new Envelope().a(0.9).adsr(0.5, 0.25, 0.8, 0.1).getSchema();

    expect(staticCycle(schema.a)).toEqual([[0.5]]);
  });

  it("keeps ADSR source permissions explicit at compile time", () => {
    const d = new Drome();
    const reusable = createShorthand("0.2 0.4");
    const structured = createStructuredInput(0.2, 0.4);
    const valid = () => {
      expectTypeOf(
        new Envelope().adsr(0.2, "0.3", reusable, structured),
      ).toMatchTypeOf<Envelope>();
      expectTypeOf(
        d.synth().adsr(0.2, "0.3", reusable, structured),
      ).toMatchTypeOf<ReturnType<Drome["synth"]>>();
    };
    expectTypeOf(valid).toBeFunction();

    const random = new RandomCycle().steps(2);
    const nested = new Envelope();
    const lfo = d.lfo(0, 1);
    const midi = d.midi.cc(74);
    const parameter = new Parameter(0.2);
    const invalid = () => {
      // @ts-expect-error Random cycles are not positional ADSR values.
      new Envelope().adsr(random, 0.2, 0.8, 0.1);
      // @ts-expect-error Raw arrays are not positional ADSR values.
      new Envelope().adsr(0.1, [0.2, 0.3], 0.8, 0.1);
      // @ts-expect-error Audio sources are not positional ADSR values.
      new Envelope().adsr(nested, 0.2, 0.8, 0.1);
      // @ts-expect-error LFO sources are not positional ADSR values.
      new Envelope().adsr(0.1, lfo, 0.8, 0.1);
      // @ts-expect-error MIDI sources are not positional ADSR values.
      new Envelope().adsr(0.1, 0.2, midi, 0.1);
      // @ts-expect-error Parameter wrappers are not positional ADSR values.
      new Envelope().adsr(0.1, 0.2, 0.8, parameter);
      // @ts-expect-error The envelope method requires all four values.
      new Envelope().adsr(0.1, 0.2, 0.8);
      // @ts-expect-error The envelope method rejects extra values.
      new Envelope().adsr(0.1, 0.2, 0.8, 0.1, 1);
      // @ts-expect-error Instrument ADSR also rejects random values.
      d.synth().adsr(random, 0.2, 0.8, 0.1);
      // @ts-expect-error Instrument ADSR also rejects arrays.
      d.synth().adsr(0.1, [0.2, 0.3], 0.8, 0.1);
      // @ts-expect-error Instrument ADSR rejects all audio source wrappers.
      d.synth().adsr(0.1, nested, 0.8, 0.1);
      // @ts-expect-error Instrument ADSR requires all four values.
      d.synth().adsr(0.1, 0.2, 0.8);
      // @ts-expect-error Instrument ADSR rejects extra values.
      d.synth().adsr(0.1, 0.2, 0.8, 0.1, 1);
    };
    expectTypeOf(invalid).toBeFunction();
  });

  it("supports mode and method chaining", () => {
    const envelope = new Envelope();

    expect(envelope.max(0.5)).toBe(envelope);
    expect(envelope.adsr(0.1, 0.1, 0.8, 0.1)).toBe(envelope);
    expect(envelope.a(0.1)).toBe(envelope);
    expect(envelope.d(0.1)).toBe(envelope);
    expect(envelope.s(0.8)).toBe(envelope);
    expect(envelope.r(0.1)).toBe(envelope);
    expect(envelope.mode("bounded")).toBe(envelope);
    expect(envelope.getSchema().mode).toBe("bounded");
  });
});
