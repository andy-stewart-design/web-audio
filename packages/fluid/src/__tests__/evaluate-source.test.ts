import type { DromeSchema } from "@web-audio/schema";
import { describe, expect, expectTypeOf, it } from "vitest";
import Drome, { evaluateSource } from "../index";

// Exercise the public API with real Fluid compilation and graph validation.
describe("evaluateSource", () => {
  it("returns an empty schema synchronously without supplying a BPM", () => {
    const schema = evaluateSource("");

    expectTypeOf(schema).toEqualTypeOf<DromeSchema>();
    expect(schema).toEqual({
      bpm: undefined,
      instruments: [],
      banks: {},
      buses: {},
    });
  });

  it("exposes drome and d as aliases of the same Drome", () => {
    expect(
      evaluateSource(`
        if (d !== drome) throw new Error('different aliases');
        d.bpm(90);
        drome.synth('sine').notes(69).push();
      `),
    ).toMatchObject({
      bpm: 90,
      instruments: [{ type: "synthesizer", waveform: "sine" }],
    });
  });

  it("preserves constructor and instrument defaults from the existing default export", () => {
    const d = new Drome();
    d.synth().push();

    expect(evaluateSource("d.synth().push();")).toEqual(d.getSchema());
  });

  it("isolates instruments, banks, buses, and BPM between calls", () => {
    expect(
      evaluateSource(`
        d.bpm(95);
        d.loadSamples({kick: ['kick.wav']});
        d.bus('drums');
        d.sample('kick').bank('user').route('drums').push();
      `),
    ).toMatchObject({
      bpm: 95,
      instruments: [{ type: "sampler", bank: "user", route: "drums" }],
      banks: { user: { samples: { kick: expect.anything() } } },
      buses: { drums: expect.anything() },
    });
    expect(evaluateSource("")).toEqual({
      bpm: undefined,
      instruments: [],
      banks: {},
      buses: {},
    });
  });

  it("gets the schema from Drome rather than the source return value", () => {
    expect(
      evaluateSource("d.synth().push(); return {ignored: true};"),
    ).toMatchObject({ instruments: [{ type: "synthesizer" }] });
  });

  it.each([
    ["syntax", "const = ;", /Unexpected token/],
    [
      "runtime",
      "d.bpm(70); throw new Error('sketch failed');",
      /^sketch failed$/,
    ],
    [
      "schema",
      "d.synth().route('missing').push();",
      /does not reference a declared bus/,
    ],
    ["top-level await", "await Promise.resolve();", /await/],
  ])(
    "propagates %s errors without poisoning a later call",
    (_kind, code, message) => {
      expect(() => evaluateSource(code)).toThrow(message);
      expect(evaluateSource("d.synth().push();")).toMatchObject({
        bpm: undefined,
        instruments: [{ type: "synthesizer" }],
      });
    },
  );

  it("does not wrap non-Error throws", () => {
    let thrown: unknown;
    try {
      evaluateSource("throw 'raw failure';");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBe("raw failure");
  });

  it("does not await returned promises or include later mutations", async () => {
    const schema = evaluateSource(
      "return Promise.resolve().then(() => d.synth().push());",
    );

    expect(schema.instruments).toEqual([]);
    await Promise.resolve();
    expect(schema.instruments).toEqual([]);
    expect(evaluateSource("").instruments).toEqual([]);
  });
});
