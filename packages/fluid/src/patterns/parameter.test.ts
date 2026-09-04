import { RandomCycle } from "@web-audio/patterns";
import { describe, expect, it } from "vitest";
import Parameter from "./parameter";

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
