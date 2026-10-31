import { describe, expect, it } from "vitest";
import Drome from "@/drome";
import Compressor from "../compressor";

const schemaValue = (value: number) => ({
  type: "static" as const,
  cycle: [[value]],
});

describe("Compressor", () => {
  it("serializes native defaults and constructor controls", () => {
    expect(new Compressor().getSchema()).toEqual({
      type: "compressor",
      threshold: schemaValue(-24),
      ratio: schemaValue(12),
      knee: schemaValue(30),
      attack: schemaValue(0.003),
      release: schemaValue(0.25),
    });
    expect(new Compressor(-18, 4).getSchema()).toMatchObject({
      threshold: schemaValue(-18),
      ratio: schemaValue(4),
      knee: schemaValue(30),
      attack: schemaValue(0.003),
      release: schemaValue(0.25),
    });
  });

  it("replaces all control values instead of accumulating stages", () => {
    const schema = new Compressor(-18, 4)
      .threshold(-12)
      .ratio(6)
      .knee(8)
      .attack(0.01)
      .release(0.4)
      .getSchema();

    expect(schema.threshold).toEqual(schemaValue(-12));
    expect(schema.ratio).toEqual(schemaValue(6));
    expect(schema.knee).toEqual(schemaValue(8));
    expect(schema.attack).toEqual(schemaValue(0.01));
    expect(schema.release).toEqual(schemaValue(0.4));
  });

  it("serializes shorthand, structured, and deterministic random controls", () => {
    const drome = new Drome();
    const compressor = drome
      .compressor(drome.sh("-18"), 4)
      .knee(drome.str(10, 20))
      .attack(drome.rand().steps(2).range(0.003, 0.01));

    expect(compressor.getSchema()).toMatchObject({
      threshold: { type: "static", cycle: [[-18]] },
      ratio: schemaValue(4),
      knee: { type: "static", cycle: [[10], [20]] },
      attack: { type: "random-number", valuesPerBar: [2] },
    });
  });

  it("rejects extra constructor values and missing setter values", () => {
    const drome = new Drome();

    expect(() => Reflect.construct(Compressor, [1, 2, 3])).toThrow(
      "at most two",
    );
    expect(() => Reflect.apply(drome.compressor, drome, [1, 2, 3])).toThrow(
      "at most two",
    );
    expect(() => new Compressor(NaN)).toThrow();
    expect(() => new Compressor(1, Infinity)).toThrow();
    expect(() => new Compressor([1, 2] as never)).toThrow();
  });

  it("attaches only to named buses", () => {
    const drome = new Drome();
    drome.bus("drums").fx(drome.compressor(-18, 4));

    expect(drome.getSchema().buses.drums.effects).toEqual([
      expect.objectContaining({
        type: "compressor",
        threshold: schemaValue(-18),
        ratio: schemaValue(4),
      }),
    ]);
    const instrument = drome.synth();
    Reflect.apply(instrument.fx, instrument, [drome.compressor()]);
    instrument.push();
    expect(() => drome.getSchema()).toThrow(
      "Instrument 0.effects[0].type is invalid.",
    );
    expect(() => drome.bus("main").fx(drome.compressor())).toThrow(
      "Effects on main",
    );
  });
});
