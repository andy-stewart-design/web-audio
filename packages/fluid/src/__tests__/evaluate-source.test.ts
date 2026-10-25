import type { DromeSchema } from "@web-audio/schema";
import { isStructuredInput } from "@web-audio/patterns";
import { describe, expect, expectTypeOf, it } from "vitest";
import { isShorthand } from "@/inputs/decode-shorthand-input";
import Drome, { evaluateSource } from "../index";
import {
  allowedSourcesSketch,
  aliases,
  evaluatedMatrixSketch,
} from "./support/pattern-input-evaluation";

function wrapperFree(value: unknown, path = "graph") {
  if (isStructuredInput(value) || isShorthand(value)) {
    throw new Error(`${path} contains a source wrapper.`);
  }
  if (value === null || typeof value !== "object") return;

  const expectedPrototype = Array.isArray(value)
    ? Array.prototype
    : Object.prototype;
  expect(Object.getPrototypeOf(value), path).toBe(expectedPrototype);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => wrapperFree(entry, `${path}[${index}]`));
    return;
  }
  Object.entries(value).forEach(([key, entry]) =>
    wrapperFree(entry, `${path}.${key}`),
  );
}

function withoutLfoIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutLfoIds);
  if (value === null || typeof value !== "object") return value;

  const isLfo = Object.entries(value).some(
    ([key, entry]) => key === "type" && entry === "lfo",
  );
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      isLfo && key === "id" ? "<lfo>" : withoutLfoIds(entry),
    ]),
  );
}

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

  it.each(aliases)(
    "matches direct, reusable, and structured source values for %s",
    (api) => {
      const direct = evaluateSource(evaluatedMatrixSketch(api, "direct"));
      wrapperFree(direct);
      for (const representation of ["reusable", "structured"] as const) {
        const graph = evaluateSource(
          evaluatedMatrixSketch(api, representation),
        );
        wrapperFree(graph);
        expect(withoutLfoIds(graph)).toEqual(withoutLfoIds(direct));
      }

      const synth = direct.instruments[0];
      if (synth.type !== "synthesizer") throw new Error("Expected a synth");
      expect(synth.gain).toMatchObject({
        type: "envelope",
        min: { type: "static", cycle: [[0.1], [0.2]] },
        max: { type: "static", cycle: [[0.8], [0.9]] },
      });
      expect(synth.eventPattern.notes).toEqual({
        type: "static",
        cycle: [[[60], [64]]],
      });
      expect(synth.eventPattern.timing.cycle).toEqual([
        [
          { offset: 0, duration: 0.5 },
          { offset: 0.5, duration: 0.5 },
        ],
      ]);

      const sampler = direct.instruments[1];
      if (sampler.type !== "sampler") {
        throw new Error("Expected a sampler");
      }
      // Chop owns four one-hit bars, so each bar uses the first note step.
      expect(sampler.eventPattern.notes).toEqual({
        type: "static",
        cycle: Array.from({ length: 4 }, () => [[60]]),
      });
      expect(sampler.region).toMatchObject({
        type: "chop",
        sequence: { type: "static", cycle: [[0], [2], [1], [3]] },
      });
      expect(sampler.eventPattern.timing.cycle).toEqual(
        Array.from({ length: 4 }, () => [{ offset: 0, duration: 1 }]),
      );
      expect(direct.banks.local).toEqual({
        samples: {
          bd: { "0": [{ type: "file", src: "/bd.wav" }] },
        },
      });
    },
  );

  it.each(aliases)(
    "keeps allowed random and audio-source permissions through evaluation for %s",
    (api) => {
      const graph = evaluateSource(allowedSourcesSketch(api));
      wrapperFree(graph);

      const synth = graph.instruments[0];
      if (synth.type !== "synthesizer") throw new Error("Expected a synth");
      expect(synth.gain.max.type).toBe("random-number");
      expect(synth.noise?.gain.type).toBe("lfo");
      expect(synth.detune.type).toBe("midi-cc");
      expect(synth.effects[0]).toMatchObject({
        type: "filter",
        frequency: { type: "midi-cc" },
      });

      const sampler = graph.instruments[1];
      if (sampler.type !== "sampler") throw new Error("Expected a sampler");
      expect(sampler.region).toMatchObject({
        type: "chop",
        sequence: { type: "random-number" },
      });
    },
  );

  it.each(aliases)(
    "rejects malformed evaluated positional composition without poisoning %s",
    (api) => {
      const invalidCalls = [
        `${api}.synth().noise([0.2, 0.4])`,
        `${api}.synth().noise(0.2, 0.4)`,
        `${api}.filter("lp", [400, 800])`,
        `${api}.filter("lp", 400, 800)`,
        `${api}.lfo([0, 1], 1)`,
        `${api}.lfo(0, 1, 2)`,
        `${api}.synth().adsr([0.1, 0.2], 0.2, 0.8, 0.1)`,
        `${api}.synth().adsr(0.1, 0.2, 0.8, 0.1, 0.3)`,
        `${api}.env([0, 1])`,
        `${api}.env(0, 1, 2)`,
        `${api}.env(undefined, 0.8)`,
        `${api}.env(0.1, undefined)`,
        `const sample = ${api}.sample("bd"); sample.chop(4, [0, 1]);`,
        `const sample = ${api}.sample("bd"); sample.chop(4, 0, 1);`,
        `const sample = ${api}.sample("bd"); sample.chop(4, undefined);`,
        `${api}.synth().noise(${api}.str("0.2"))`,
        `${api}.filter("lp", ${api}.str("400"))`,
        `${api}.synth().adsr(${api}.str("0.1"), 0.2, 0.8, 0.1)`,
        `${api}.synth().detune(${api}.sh("0.2 ~ 0.8"))`,
        `${api}.synth().detune(${api}.str(${api}.str(0.2)))`,
        `${api}.synth().detune("0.2", ${api}.sh("0.8"))`,
        `${api}.synth().detune(${api}.str(${api}.rand()))`,
        `${api}.synth().notes(${api}.str("60"))`,
        `${api}.synth().adsr(${api}.rand(), 0.2, 0.8, 0.1)`,
        `${api}.env(${api}.lfo(0, 1))`,
        `${api}.env(${api}.midi.cc(74).range(0, 1).default(0.5))`,
        `const sample = ${api}.sample("bd"); sample.chop(4, ${api}.lfo(0, 1));`,
      ];

      for (const source of invalidCalls) {
        expect(() => evaluateSource(source)).toThrow();
      }
      expect(evaluateSource("")).toEqual({
        bpm: undefined,
        instruments: [],
        banks: {},
        buses: {},
      });
    },
  );

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
