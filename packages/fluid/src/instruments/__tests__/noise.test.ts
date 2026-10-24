import { describe, expect, it } from "vitest";
import Drome from "@/drome";
import Envelope from "@/automations/envelope";
import Lfo from "@/automations/lfo";
import Parameter from "@/parameters/parameter";
import { RandomCycle } from "@web-audio/patterns";
import Sampler from "../sampler";
import Synthesizer from "../synthesizer";
import UnisonSynthesizer from "../unison-synthesizer";

function noiseOf(instrument: Synthesizer | UnisonSynthesizer | Sampler) {
  const schema = instrument.getSchema();
  if (!schema.noise) throw new Error("Expected noise layer");
  return schema.noise;
}

function staticValue(schema: ReturnType<typeof noiseOf>["gain"]) {
  if (schema.type !== "static") throw new Error("Expected static gain");
  return schema.cycle[0][0];
}

describe("instrument noise layers", () => {
  it("uses fixed named parameters in every noise implementation", () => {
    for (const instrument of [
      new Synthesizer(),
      new UnisonSynthesizer(),
      new Sampler("kick"),
    ]) {
      expect(instrument.noise).toHaveLength(2);
    }
  });

  it.each([
    () => new Synthesizer(),
    () => new UnisonSynthesizer(),
    () => new Sampler("kick"),
  ])("defaults to no noise and enables white noise at gain one", (create) => {
    const instrument = create();
    expect(instrument.getSchema().noise).toBeUndefined();

    expect(instrument.noise(1)).toBe(instrument);
    expect(noiseOf(instrument)).toMatchObject({ color: "white" });
    expect(staticValue(noiseOf(instrument).gain)).toBe(1);
  });

  it("supports colors and every existing gain input form", () => {
    const drome = new Drome();
    const envelope = new Envelope().adsr(0.01, 0.2, 0, 0.1);
    const lfo = new Lfo(0, 1);
    const midi = drome.midi.cc(74);

    const numeric = new Synthesizer().noise(0.3);
    expect(noiseOf(numeric)).toMatchObject({ color: "white" });
    expect(staticValue(noiseOf(numeric).gain)).toBe(0.3);
    expect(staticValue(noiseOf(new Synthesizer().noise(-2)).gain)).toBe(-2);
    expect(
      noiseOf(new Synthesizer().noise(new Drome().str([1.5, -1]))).gain,
    ).toMatchObject({
      type: "static",
      cycle: [[1.5, -1]],
    });
    expect(noiseOf(new Synthesizer().noise("pink", 1)).color).toBe("pink");
    expect(
      noiseOf(new Synthesizer().noise("pink", new Drome().str([0.2, 0.4])))
        .gain,
    ).toMatchObject({
      type: "static",
      cycle: [[0.2, 0.4]],
    });
    expect(noiseOf(new Synthesizer().noise(envelope)).gain).toEqual(
      envelope.getSchema(),
    );
    expect(noiseOf(new Synthesizer().noise(lfo)).gain).toEqual(lfo.getSchema());
    expect(noiseOf(new Synthesizer().noise(midi)).gain).toEqual(
      midi.getSchema("gain"),
    );
    expect(
      noiseOf(new Synthesizer().noise(new RandomCycle().steps(2))).gain.type,
    ).toBe("random-number");
  });

  it.each([
    () => new Synthesizer(),
    () => new UnisonSynthesizer(),
    () => new Sampler("kick"),
  ])("rejects invalid gain values without changing the layer", (create) => {
    const drome = new Drome();
    const instrument = create().noise(0.4);
    const previousState = Reflect.get(instrument, "_noise");
    const invalidInputs: unknown[][] = [
      [[0.2, 0.4]],
      ["pink", [0.2, 0.4]],
      [0.2, 0.1],
      ["pink", 0.2, 0.1],
      ["blue", 0.2],
      [],
      ["white"],
      ["pink"],
      [undefined],
      ["pink", undefined],
      [null],
      ["pink", null],
      [NaN],
      ["pink", Infinity],
      [-Infinity],
      [true],
      [{}],
      [new Parameter(0.2)],
      [drome.str("0.2")],
      [drome.str(null)],
      [drome.str([[0.2, 0.3]])],
      [drome.str([0.2, 0.3]), 0.4],
    ];

    for (const input of invalidInputs) {
      const previousSchema = instrument.getSchema().noise;
      expect(() =>
        Reflect.apply(instrument.noise, instrument, input),
      ).toThrow();
      expect(Reflect.get(instrument, "_noise")).toBe(previousState);
      expect(instrument.getSchema().noise).toEqual(previousSchema);
    }
  });

  it.each([
    () => new Synthesizer(),
    () => new UnisonSynthesizer(),
    () => new Sampler("kick"),
  ])("supports every permitted source with either color", (create) => {
    const drome = new Drome();
    const sources = [
      new RandomCycle().steps(2),
      new Envelope(),
      new Lfo(0, 1),
      drome.midi.cc(74),
    ];

    for (const source of sources) {
      expect(noiseOf(create().noise(source)).gain.type).toMatch(
        /random-number|envelope|lfo|midi-cc/,
      );
      expect(noiseOf(create().noise("pink", source)).color).toBe("pink");
    }
  });

  it("interprets non-color strings as numeric shorthand", () => {
    expect(() => new Synthesizer().noise("blue")).toThrow(
      "[Instrument] noise() gain atom 'blue' must be a finite numeric value",
    );
  });

  it("resets each color with explicit gain without changing dedicated gain syntax", () => {
    const drome = new Drome();
    const instrument = new Synthesizer()
      .gain(0.2, 0.4)
      .noise(drome.str(0.3, 0.6));
    for (const color of ["white", "pink"] as const) {
      expect(instrument.noise(color, 1)).toBe(instrument);
      expect(noiseOf(instrument).color).toBe(color);
      expect(staticValue(noiseOf(instrument).gain)).toBe(1);
    }
    expect(instrument.getSchema().gain.max).toEqual({
      type: "static",
      cycle: [[0.2], [0.4]],
    });
    instrument.noise(1);
    expect(noiseOf(instrument).color).toBe("white");
    expect(staticValue(noiseOf(instrument).gain)).toBe(1);
  });

  it("replaces the complete layer and resets the omitted color", () => {
    const instrument = new Synthesizer().noise("pink", 0.25);

    instrument.noise(0);

    const noise = noiseOf(instrument);
    expect(noise.color).toBe("white");
    expect(staticValue(noise.gain)).toBe(0);
  });
});
