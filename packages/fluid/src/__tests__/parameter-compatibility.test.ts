import { validateDromeGraph } from "@web-audio/schema";
import { RandomCycle } from "@web-audio/patterns";
import { describe, expect, it } from "vitest";
import Drome from "@/drome";
import Envelope from "@/automations/envelope";
import Filter from "@/effects/filter";
import GainEffect from "@/effects/gain";
import Parameter from "@/parameters/parameter";
import Sampler from "@/instruments/sampler";
import Synthesizer from "@/instruments/synthesizer";
import UnisonSynthesizer from "@/instruments/unison-synthesizer";

function staticCycle(pattern: { type: string; cycle?: number[][] }) {
  expect(pattern.type).toBe("static");
  if (pattern.type !== "static" || pattern.cycle === undefined) {
    throw new Error("Expected a static numeric pattern");
  }
  return pattern.cycle;
}

function staticValue(pattern: { type: string; cycle?: number[][] }) {
  return staticCycle(pattern)[0][0];
}

describe("structured parameter compatibility", () => {
  it("keeps envelope factory minimum forwarding and defaults distinct", () => {
    const d = new Drome();
    const omitted = d.env().getSchema();
    const explicitUndefined = d.env(undefined).getSchema();
    const numericMinimum = d.env(0.25).getSchema();
    const undefinedMinimum = d.env(undefined, [0.25, 0.5]).getSchema();

    expect(omitted.min).toBe(0);
    expect(omitted.max).toEqual({ type: "static", cycle: [[1]] });
    expect(explicitUndefined).toEqual(omitted);
    expect(numericMinimum).toMatchObject({
      min: 0.25,
      max: { type: "static", cycle: [[1]] },
    });
    expect(undefinedMinimum).toMatchObject({
      min: 0,
      max: { type: "static", cycle: [[0.25, 0.5]] },
    });
  });

  it("separates numeric serialization failures from graph validation", () => {
    expect(() => new Parameter([]).getSchema()).toThrow(
      "ValueCycle cannot serialize an empty bar",
    );

    const emptyParameterSchema = new Parameter().getSchema();
    expect(emptyParameterSchema).toEqual({ type: "static", cycle: [] });
    const instrument = new Synthesizer().getSchema();
    instrument.detune = emptyParameterSchema;
    expect(() =>
      validateDromeGraph({
        bpm: undefined,
        instruments: [instrument],
        banks: {},
        buses: {},
      }),
    ).toThrow("Instrument 0.detune.cycle must contain at least one bar");

    const nonFiniteEnvelope = new Synthesizer()
      .gain(new Envelope(Number.NaN))
      .getSchema();
    expect(nonFiniteEnvelope.gain.min).toBeNaN();
    expect(() =>
      validateDromeGraph({
        bpm: undefined,
        instruments: [nonFiniteEnvelope],
        banks: {},
        buses: {},
      }),
    ).toThrow("Instrument 0.gain.min must be finite");
  });

  it("preserves supported source schemas and contextual MIDI identities", () => {
    const d = new Drome();
    const envelope = d.env(0, 1).adsr(0.01, 0.2, 0.8, 0.1);
    const lfo = d.lfo(0, 1);
    const midi = d.midi.cc("controller", 74).channel(3);

    const synth = new Synthesizer().detune(envelope).noise(lfo).getSchema();
    expect(synth.detune).toEqual(envelope.getSchema());
    expect(synth.noise?.gain).toEqual(lfo.getSchema());

    const filter = new Filter("lp", midi)
      .q(midi)
      .detune(midi)
      .gain(midi)
      .getSchema();
    expect(filter.frequency).toEqual(midi.getSchema("frequency"));
    expect(filter.q).toEqual(midi.getSchema("q"));
    expect(filter.detune).toEqual(midi.getSchema("detune"));
    expect(filter.gain).toEqual(midi.getSchema("filterGain"));

    const gain = new GainEffect(midi).getSchema();
    expect(gain.gain).toEqual(midi.getSchema("gain"));

    const unison = new UnisonSynthesizer().spread(midi).width(midi).getSchema();
    expect(unison.spread).toEqual(midi.getSchema("spread"));
    expect(unison.width).toEqual(midi.getSchema("width"));
  });

  it("forwards each positional ADSR field independently through instruments", () => {
    const schema = new Synthesizer()
      .adsr("0.01 0.02", "0.1", "0.8 0.7", "0.2 0.3")
      .getSchema().gain;

    expect(staticCycle(schema.a)).toEqual([[0.01, 0.02]]);
    expect(staticCycle(schema.d)).toEqual([[0.1]]);
    expect(staticCycle(schema.s)).toEqual([[0.8, 0.7]]);
    expect(staticCycle(schema.r)).toEqual([[0.2, 0.3]]);
  });

  it("keeps noise defaults, selector aliases, and sampler duration aliases", () => {
    const defaultNoise = new Synthesizer().noise().getSchema().noise;
    expect(defaultNoise).toMatchObject({ color: "white" });
    expect(defaultNoise && staticValue(defaultNoise.gain)).toBe(1);

    const pinkNoise = new Synthesizer().noise("pink").getSchema().noise;
    expect(pinkNoise).toMatchObject({ color: "pink" });
    expect(pinkNoise && staticValue(pinkNoise.gain)).toBe(1);

    const duration = new Sampler("bd").duration(0.25).getSchema();
    const alias = new Sampler("bd").dur(0.25).getSchema();
    expect(alias.region).toEqual(duration.region);
  });

  it("retains random source state when shared across parameter consumers", () => {
    const random = new RandomCycle().steps(2, 0).range(0, 1);
    const parameter = new Parameter(random);
    const envelope = new Envelope(0, random);

    random.steps(1, 3);

    expect(parameter.getSchema()).toMatchObject({
      type: "random-number",
      valuesPerBar: [1, 3],
    });
    expect(envelope.getSchema().max).toMatchObject({
      type: "random-number",
      valuesPerBar: [1, 3],
    });
  });
});
