import { describe, expect, it } from "vitest";
import Drome from "@/drome";
import Envelope from "@/automations/envelope";
import Lfo from "@/automations/lfo";
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
  it.each([
    () => new Synthesizer(),
    () => new UnisonSynthesizer(),
    () => new Sampler("kick"),
  ])("defaults to no noise and enables white noise at gain one", (create) => {
    const instrument = create();
    expect(instrument.getSchema().noise).toBeUndefined();

    expect(instrument.noise()).toBe(instrument);
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
    expect(noiseOf(new Synthesizer().noise([1.5, -1])).gain).toMatchObject({
      type: "static",
      cycle: [[1.5, -1]],
    });
    expect(noiseOf(new Synthesizer().noise("pink")).color).toBe("pink");
    expect(
      noiseOf(new Synthesizer().noise("pink", [0.2, 0.4])).gain,
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

  it("rejects unsupported colors", () => {
    expect(() => new Synthesizer().noise("blue" as "white")).toThrow(
      '[Instrument] noise() color must be "white" or "pink".',
    );
  });

  it("replaces the complete layer and resets omitted defaults", () => {
    const instrument = new Synthesizer().noise("pink", 0.25);

    instrument.noise(0);

    const noise = noiseOf(instrument);
    expect(noise.color).toBe("white");
    expect(staticValue(noise.gain)).toBe(0);
  });
});
