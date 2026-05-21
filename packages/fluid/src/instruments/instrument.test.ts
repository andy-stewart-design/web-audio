import { describe, expect, it } from "vitest";
import Sampler from "./sampler";
import Synthesizer from "./synthesizer";
import Envelope from "@/automations/envelope";
import type { EnvelopeSchema } from "@web-audio/schema";

function staticValue(schema: EnvelopeSchema["a"]) {
  expect(schema.type).toBe("static");
  if (schema.type !== "static") throw new Error("Expected static schema");
  return schema.cycle[0][0].value;
}

function expectGainADSR(
  envelope: EnvelopeSchema,
  expected: { a: number; d: number; s: number; r: number },
) {
  expect(staticValue(envelope.a)).toBe(expected.a);
  expect(staticValue(envelope.d)).toBe(expected.d);
  expect(staticValue(envelope.s)).toBe(expected.s);
  expect(staticValue(envelope.r)).toBe(expected.r);
}

describe("Instrument gain envelopes", () => {
  it("defaults synth gain to a faster synth envelope", () => {
    const schema = new Synthesizer().getSchema();

    expectGainADSR(schema.gain, { a: 0.005, d: 0, s: 1, r: 0.005 });
  });

  it("defaults sampler gain to a sharper sample envelope", () => {
    const schema = new Sampler("kick").getSchema();

    expectGainADSR(schema.gain, { a: 0.0025, d: 0, s: 1, r: 0.005 });
  });

  it("preserves synth gain defaults when setting gain value", () => {
    const schema = new Synthesizer().gain(0.5).getSchema();

    expectGainADSR(schema.gain, { a: 0.005, d: 0, s: 1, r: 0.005 });
  });

  it("preserves sampler gain defaults when setting gain value", () => {
    const schema = new Sampler("kick").gain(0.5).getSchema();

    expectGainADSR(schema.gain, { a: 0.0025, d: 0, s: 1, r: 0.005 });
  });

  it("uses explicit gain envelopes as-is", () => {
    const env = new Envelope().adsr(0.1, 0.2, 0.3, 0.4);
    const schema = new Sampler("kick").gain(env).getSchema();

    expectGainADSR(schema.gain, { a: 0.1, d: 0.2, s: 0.3, r: 0.4 });
  });

  it("supports adsr shorthand for gain envelope", () => {
    const schema = new Synthesizer().adsr(0, 1, 0.333, 1).getSchema();

    expectGainADSR(schema.gain, { a: 0, d: 1, s: 0.333, r: 1 });
  });
});
