import { RandomCycle } from "@web-audio/patterns";
import type { NumberPattern } from "@web-audio/schema";
import { describe, expect, it } from "vitest";
import Envelope from "./envelope";

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
      min: 0,
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

    expect(schema.min).toBe(0.1);
    expect(schema.max).toEqual({
      type: "static",
      cycle: [
        [0.75, 1.25],
        [0.25, 0.5],
      ],
    });
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

  it("accepts intra-bar values for each ADSR parameter", () => {
    const schema = new Envelope()
      .adsr([0.2, 0.4], [0.1, 0.2], [0.8, 0.6], [0.05, 0.1])
      .getSchema();

    expect(staticCycle(schema.a)).toEqual([[0.2, 0.4]]);
    expect(staticCycle(schema.d)).toEqual([[0.1, 0.2]]);
    expect(staticCycle(schema.s)).toEqual([[0.8, 0.6]]);
    expect(staticCycle(schema.r)).toEqual([[0.05, 0.1]]);
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
