import { describe, expect, it } from "vitest";
import { validateDromeGraph } from "@web-audio/schema";
import Drome from "@/drome";

function staticValue(value: { type: "static"; cycle: number[][] }) {
  return value.cycle[0][0];
}

describe("unison authoring", () => {
  it("supports both selectors and serializes the saw-only engine", () => {
    const drome = new Drome();
    const unison = drome
      .synth("unison")
      .type("saw")
      .voices(8)
      .spread(24)
      .width(0.65)
      .notes(60)
      .push();
    const uni = new Drome().synth("uni");
    const defaultSchema = new Drome().synth("unison").getSchema();
    const explicitSchema = new Drome()
      .synth("uni")
      .type("sawtooth")
      .getSchema();

    expect(unison.constructor).toBe(uni.constructor);
    expect(defaultSchema).toEqual(explicitSchema);
    const schema = unison.getSchema();
    expect(schema).toMatchObject({
      type: "synthesizer",
      engine: "unison",
      waveform: "sawtooth",
      voices: { type: "static" },
      spread: { type: "static" },
      width: { type: "static" },
    });
    if (
      schema.engine !== "unison" ||
      schema.voices.type !== "static" ||
      schema.spread.type !== "static" ||
      schema.width.type !== "static"
    ) {
      throw new Error("Expected a static unison schema");
    }
    expect(staticValue(schema.voices)).toBe(8);
    expect(staticValue(schema.spread)).toBe(24);
    expect(staticValue(schema.width)).toBe(0.65);
    expect(() => validateDromeGraph(drome.getSchema())).not.toThrow();
  });

  it("serializes explicit phase modes and preserves fluent chaining", () => {
    const drome = new Drome();
    const unison = drome.synth("unison");

    expect(unison.getSchema()).not.toHaveProperty("phase");
    expect(unison.phase("fixed")).toBe(unison);
    expect(unison.getSchema().phase).toBe("fixed");
    expect(unison.phase("fixed", 0.5)).toBe(unison);
    expect(unison.getSchema()).toMatchObject({
      phase: "fixed",
      phaseOffset: 0.5,
    });
    expect(unison.phase("fixed").getSchema()).not.toHaveProperty("phaseOffset");
    expect(unison.phase("random")).toBe(unison);
    expect(unison.getSchema().phase).toBe("random");
  });

  it("rejects unsupported unison shapes, phase modes, and selectors at runtime", () => {
    const drome = new Drome();
    const unison = drome.synth("unison");
    const setPhase = Reflect.get(unison, "phase");
    if (typeof setPhase !== "function") {
      throw new Error("Expected unison phase setter");
    }
    expect(() => Reflect.apply(setPhase, unison, ["free"])).toThrow();
    expect(() => Reflect.apply(setPhase, unison, ["random", 0.5])).toThrow();
    expect(() => Reflect.apply(setPhase, unison, ["fixed", -0.1])).toThrow();
    expect(() => Reflect.apply(setPhase, unison, ["fixed", 1.1])).toThrow();
    expect(() => Reflect.apply(setPhase, unison, ["fixed", NaN])).toThrow();
    expect(() => Reflect.apply(setPhase, unison, ["fixed", 0.5, 0])).toThrow();

    const setType = Reflect.get(unison, "type");
    if (typeof setType !== "function") {
      throw new Error("Expected unison type setter");
    }

    expect(() => Reflect.apply(setType, unison, ["square"])).toThrow();
    expect(() => Reflect.apply(setType, unison, ["sine"])).toThrow();
    expect(() => Reflect.apply(setType, unison, ["triangle"])).toThrow();

    const synth = Reflect.get(drome, "synth");
    if (typeof synth !== "function") {
      throw new Error("Expected synth factory");
    }
    expect(() => Reflect.apply(synth, drome, ["supersaw"])).toThrow();
  });

  it("uses unison-specific MIDI contexts for spread and width", () => {
    const drome = new Drome();
    const spread = drome.midi.cc(74);
    const width = drome.midi.cc(75);
    const instrument = drome.synth("uni").spread(spread).width(width).push();

    const schema = instrument.getSchema();
    expect(schema.spread).toMatchObject({
      type: "midi-cc",
      range: { min: 0, max: 100, curve: "linear" },
      default: 10,
    });
    expect(schema.width).toMatchObject({
      type: "midi-cc",
      range: { min: 0, max: 1, curve: "linear" },
      default: 0.4,
    });
  });
});
