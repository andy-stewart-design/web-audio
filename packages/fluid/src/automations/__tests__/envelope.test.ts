import { RandomCycle } from "@web-audio/patterns";
import type { NumberPattern } from "@web-audio/schema";
import Drome from "@/drome";
import { describe, expect, it } from "vitest";
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

  it("serializes custom min and multi-bar max values", () => {
    const schema = new Envelope(0.1, [0.75, 1.25], [0.25, 0.5]).getSchema();

    expect(schema.min).toEqual({ type: "static", cycle: [[0.1]] });
    expect(schema.max).toEqual({
      type: "static",
      cycle: [
        [0.75, 1.25],
        [0.25, 0.5],
      ],
    });
  });

  it("rejects an explicit undefined minimum with a maximum", () => {
    expect(() => Reflect.construct(Envelope, [undefined, 0.25])).toThrow(
      "minimum must be a number",
    );
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
      "minimum must be a number, shorthand, structured input, or random cycle",
    );
    expect(() => Reflect.construct(Envelope, [d.lfo(0, 1), 1])).toThrow(
      "minimum must be a number, shorthand, structured input, or random cycle",
    );
    expect(() => Reflect.construct(Envelope, [d.midi.cc(74), 1])).toThrow(
      "minimum must be a number, shorthand, structured input, or random cycle",
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
  ])(
    "retains deferred validation for legacy positional %s values",
    (_label, value) => {
      const envelope = new Envelope();

      expect(() =>
        Reflect.apply(envelope.adsr, envelope, [value, 0.2, 0.8, 0.1]),
      ).not.toThrow();
      expect(() => envelope.getSchema()).toThrow(
        "ValueCycle cycle[0] must contain only finite numbers",
      );
    },
  );

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
