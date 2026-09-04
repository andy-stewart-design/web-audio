import { RandomCycle } from "@web-audio/patterns";
import { describe, expect, it } from "vitest";
import Envelope from "@/automations/envelope";
import GainEffect from "./gain";

describe("GainEffect", () => {
  it("serializes static gain bars as raw values", () => {
    expect(new GainEffect(1, 0.5, 0).getSchema()).toEqual({
      type: "gain",
      gain: { type: "static", cycle: [[1], [0.5], [0]] },
    });
  });

  it("serializes intra-bar gain values", () => {
    expect(new GainEffect([1, 0.5, 0]).getSchema().gain).toEqual({
      type: "static",
      cycle: [[1, 0.5, 0]],
    });
  });

  it("serializes random gain without timing geometry", () => {
    const schema = new GainEffect(
      new RandomCycle().steps(2, 0).range(0.25, 0.75),
    ).getSchema();

    expect(schema.gain).toMatchObject({
      type: "random-number",
      valuesPerBar: [2, 0],
      range: { min: 0.25, max: 0.75 },
    });
    expect(schema.gain).not.toHaveProperty("grid");
  });

  it("preserves envelope inputs", () => {
    expect(new GainEffect(new Envelope(0, 0.5)).getSchema().gain).toMatchObject(
      {
        type: "envelope",
        min: 0,
        max: { type: "static", cycle: [[0.5]] },
      },
    );
  });
});
