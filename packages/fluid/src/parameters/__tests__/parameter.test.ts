import { RandomCycle } from "@web-audio/patterns";
import { describe, expect, it } from "vitest";
import Drome from "@/drome";
import Parameter from "@/parameters/parameter";

describe("Parameter", () => {
  it("serializes scalar bars as raw numeric values", () => {
    expect(new Parameter(1, 0, -0.5).getSchema()).toEqual({
      type: "static",
      cycle: [[1], [0], [-0.5]],
    });
  });

  it("serializes an intra-bar value cycle without timing fields", () => {
    const schema = new Parameter([1, 0, 0.5]).getSchema();

    expect(schema).toEqual({ type: "static", cycle: [[1, 0, 0.5]] });
  });

  it("distinguishes no arguments from an empty value bar", () => {
    expect(new Parameter().getSchema()).toEqual({
      type: "static",
      cycle: [],
    });
    expect(() => new Parameter([]).getSchema()).toThrow(
      "ValueCycle cannot serialize an empty bar",
    );
  });

  it.each([
    ["NaN", Number.NaN],
    ["positive infinity", Number.POSITIVE_INFINITY],
    ["negative infinity", Number.NEGATIVE_INFINITY],
    ["null", null],
    ["undefined", undefined],
  ])("defers %s rejection until numeric serialization", (_label, value) => {
    const construct = () => Reflect.construct(Parameter, [value]);
    expect(construct).not.toThrow();
    const parameter = construct();

    expect(() => parameter.getSchema()).toThrow(
      "ValueCycle cycle[0] must contain only finite numbers",
    );
  });

  it("retains an invalid caller array reference until serialization", () => {
    const values = [Number.NaN];
    const parameter = Reflect.construct(Parameter, [values]);
    values[0] = 3;

    expect(parameter.getSchema()).toEqual({
      type: "static",
      cycle: [[3]],
    });
  });

  it("passes sparse bars through serialization but rejects them during graph validation", () => {
    const sparse = new Array<number>(3);
    sparse[0] = 1;
    sparse[2] = 2;
    const construct = () => Reflect.construct(Parameter, [sparse]);
    expect(construct).not.toThrow();
    const parameter = construct();

    expect(parameter.getSchema()).toEqual({
      type: "static",
      cycle: [[1, undefined, 2]],
    });

    const drome = new Drome();
    const instrument = drome.synth();
    Reflect.apply(instrument.detune, instrument, [sparse]);
    instrument.push();

    expect(() => drome.getSchema()).toThrow(
      "[Schema] Instrument 0.detune.cycle[0] must contain only finite numbers.",
    );
  });

  it("retains caller array and random-cycle references until serialization", () => {
    const values = [1, 2];
    const parameter = new Parameter(values);
    values[0] = 3;
    expect(parameter.getSchema()).toEqual({
      type: "static",
      cycle: [[3, 2]],
    });

    const random = new RandomCycle().steps(1);
    const randomParameter = new Parameter(random);
    random.steps(2, 0);
    expect(randomParameter.getSchema()).toMatchObject({
      type: "random-number",
      valuesPerBar: [2, 0],
    });
  });

  it("serializes random values with counts rather than a grid", () => {
    const schema = new Parameter(
      new RandomCycle().steps(4, 0, 2).range(-1, 1).rib(7, 8),
    ).getSchema();

    expect(schema).toMatchObject({
      type: "random-number",
      valuesPerBar: [4, 0, 2],
      range: { min: -1, max: 1 },
      segments: [{ seed: 7, len: 8 }],
    });
    expect(schema).not.toHaveProperty("grid");
  });

  it("rejects timing chance when used as a numeric parameter", () => {
    expect(() =>
      new Parameter(new RandomCycle().bin().chance(0.5)).getSchema(),
    ).toThrow("cannot be serialized as a numeric value pattern");
  });
});
