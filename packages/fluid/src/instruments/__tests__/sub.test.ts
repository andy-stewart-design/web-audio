import { describe, expect, expectTypeOf, it } from "vitest";
import { validateDromeGraph } from "@web-audio/schema";
import Drome from "@/drome";
import type Synthesizer from "../synthesizer";

function staticGain(value: number) {
  return { type: "static" as const, cycle: [[value]] };
}

describe("synth sub authoring", () => {
  it("serializes defaults, aliases, and replacement as one layer", () => {
    const drome = new Drome();
    const synth = drome.synth().sub("sq", -2, 0.4).sub(0.2);

    expect(synth.getSchema().sub).toEqual({
      waveform: "sine",
      octave: -1,
      gain: staticGain(0.2),
    });
    expect(() => validateDromeGraph(drome.getSchema())).not.toThrow();

    for (const [alias, waveform] of [
      ["sin", "sine"],
      ["tri", "triangle"],
      ["square", "square"],
      ["sawtooth", "sawtooth"],
    ] as const) {
      expect(drome.synth().sub(alias, -1, 0.3).getSchema().sub).toEqual({
        waveform,
        octave: -1,
        gain: staticGain(0.3),
      });
    }
  });

  it("accepts every single-slot representation without mutating reusable values", () => {
    const drome = new Drome();
    const shorthand = drome.sh("-0.5 1.5");
    const structured = drome.str([-0.5, 1.5]);
    const midi = drome.midi.cc(74);

    expect(drome.synth().sub(shorthand).getSchema().sub?.gain).toEqual({
      type: "static",
      cycle: [[-0.5, 1.5]],
    });
    expect(drome.synth().sub(-2, structured).getSchema().sub?.gain).toEqual({
      type: "static",
      cycle: [[-0.5, 1.5]],
    });
    expect(
      drome.synth().sub("triangle", -1, midi).getSchema().sub?.gain,
    ).toMatchObject({
      type: "midi-cc",
      range: { min: 0, max: 1 },
      default: 1,
    });
    expect(shorthand.source).toBe("-0.5 1.5");
    expect(structured.values).toEqual([[-0.5, 1.5]]);
  });

  it("validates the complete call before replacing the previous layer", () => {
    const synth = new Drome().synth().sub("square", -2, 0.4);
    const before = synth.getSchema().sub;

    for (const args of [
      [],
      [0.4, 0.5],
      ["square", -2],
      ["unknown", -1, 0.2],
      ["square", -3, 0.2],
      ["square", -1, Number.NaN],
      ["square", -1, [0.2, 0.5]],
      ["square", -1, 0.2, 0.5],
    ]) {
      expect(() => Reflect.apply(synth.sub, synth, args)).toThrow();
      expect(synth.getSchema().sub).toEqual(before);
    }
  });

  it("is synth-only and preserves concrete fluent types", () => {
    const drome = new Drome();
    const synth = drome.synth().sub(0.25);
    expectTypeOf(synth).toMatchTypeOf<Synthesizer>();
    expectTypeOf(synth.sub).toBeFunction();

    const sampler = drome.sample("kit");
    expectTypeOf(sampler).not.toHaveProperty("sub");
    expect(() => sampler.getSchema()).not.toThrow();
  });
});
