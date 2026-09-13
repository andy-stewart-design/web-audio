import { RandomCycle } from "@web-audio/patterns";
import type { FilterType } from "@web-audio/schema";
import { describe, expect, it } from "vitest";
import Envelope from "@/automations/envelope";
import Filter from "./filter";

describe("Filter", () => {
  it("serializes frequency and defaults as value-only patterns", () => {
    const schema = new Filter("lp", 800).getSchema();

    expect(schema).toMatchObject({ type: "filter", filterType: "lp" });
    expect(schema.frequency).toEqual({ type: "static", cycle: [[800]] });
    expect(schema.q).toEqual({ type: "static", cycle: [[1]] });
    expect(schema.detune).toEqual({ type: "static", cycle: [[0]] });
    expect(schema.gain).toEqual({ type: "static", cycle: [[0]] });
  });

  it("round-trips every filter type", () => {
    const types: FilterType[] = [
      "lp",
      "hp",
      "bp",
      "notch",
      "ap",
      "pk",
      "ls",
      "hs",
    ];

    for (const type of types) {
      expect(new Filter(type, 1_000).getSchema().filterType).toBe(type);
    }
  });

  it("serializes q, detune, and gain setters as raw values", () => {
    const schema = new Filter("lp", 800)
      .q([1, 2])
      .detune(100)
      .gain(6)
      .getSchema();

    expect(schema.q).toEqual({ type: "static", cycle: [[1, 2]] });
    expect(schema.detune).toEqual({ type: "static", cycle: [[100]] });
    expect(schema.gain).toEqual({ type: "static", cycle: [[6]] });
  });

  it("serializes scalar frequency arguments as independent bars", () => {
    expect(new Filter("lp", 400, 800, 1_200).getSchema().frequency).toEqual({
      type: "static",
      cycle: [[400], [800], [1_200]],
    });
  });

  it("serializes random frequency and q values with per-bar counts", () => {
    const schema = new Filter(
      "lp",
      new RandomCycle().steps(1, 2).range(400, 800),
    )
      .q(new RandomCycle().steps(3).range(0, 10))
      .getSchema();

    expect(schema.frequency).toMatchObject({
      type: "random-number",
      valuesPerBar: [1, 2],
      range: { min: 400, max: 800 },
    });
    expect(schema.q).toMatchObject({
      type: "random-number",
      valuesPerBar: [3],
      range: { min: 0, max: 10 },
    });
  });

  it("accepts an envelope parameter without adding timing to its values", () => {
    const schema = new Filter("lp", new Envelope(200, 4_000)).getSchema();

    expect(schema.frequency.type).toBe("envelope");
    if (schema.frequency.type !== "envelope") {
      throw new Error("Expected envelope frequency");
    }
    expect(schema.frequency.min).toBe(200);
    expect(schema.frequency.max).toEqual({
      type: "static",
      cycle: [[4_000]],
    });
  });

  it("preserves setter chaining", () => {
    const filter = new Filter("lp", 800);

    expect(filter.q(2)).toBe(filter);
    expect(filter.detune(0)).toBe(filter);
    expect(filter.gain(0)).toBe(filter);
    expect(filter.getSchema()).toMatchObject({
      q: { type: "static", cycle: [[2]] },
      detune: { type: "static", cycle: [[0]] },
      gain: { type: "static", cycle: [[0]] },
    });
  });
});
