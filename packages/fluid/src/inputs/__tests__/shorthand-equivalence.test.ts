import { evaluatePatternExpression, parseShorthand } from "@web-audio/patterns";
import { describe, expect, it } from "vitest";
import Synthesizer from "@/instruments/synthesizer";
import Sampler from "@/instruments/sampler";
import {
  decodeNotesInput,
  decodeVariationsInput,
} from "@/inputs/decode-structured-input";
import {
  decodeXoxInput,
  evaluateXoxShorthand,
} from "@/inputs/decode-xox-input";
import {
  interpretNoteAtom,
  interpretSampleNameAtom,
  interpretVariationAtom,
} from "@/inputs/atom-interpreters";
import {
  createSamplerEventState,
  createSynthEventState,
  replaceEventNotes,
  replaceEventTiming,
  replaceEventVariation,
  replaceSampleNames,
  transformEventState,
} from "@/events/transitions";
import {
  compileSamplerEventState,
  compileSynthEventState,
} from "@/events/compiler";

function shorthandNotes(source: string) {
  return evaluatePatternExpression(parseShorthand(source), interpretNoteAtom);
}

function shorthandNames(source: string) {
  return evaluatePatternExpression(
    parseShorthand(source),
    interpretSampleNameAtom,
  );
}

function shorthandVariations(source: string) {
  return evaluatePatternExpression(
    parseShorthand(source),
    interpretVariationAtom,
  );
}

describe("structured and shorthand expression equivalence", () => {
  it("matches atoms, rests, sequences, and chords", () => {
    expect(shorthandNotes("60 ~ 67")).toEqual(
      decodeNotesInput([[60, null, 67]]),
    );
    expect(shorthandNotes("60 64")).toEqual(decodeNotesInput([[60, 64]]));
    expect(shorthandNotes("[60,64]")).toEqual(decodeNotesInput([[[60, 64]]]));
  });

  it("matches structural repetition with its structured equivalent", () => {
    expect(shorthandVariations("1!2")).toEqual(decodeVariationsInput([[1, 1]]));
  });

  it("matches shorthand slowdown with a structured cycle transformed afterward", () => {
    const structured = new Synthesizer().notes(60).slow(2);
    const shorthandCycle = shorthandNotes("60/2");
    const structuredCycle = transformEventState(
      replaceEventNotes(createSynthEventState(), decodeNotesInput([60])),
      { type: "slow", multiplier: 2 },
    ).notes.cycle;
    expect(shorthandCycle).toEqual(structuredCycle);
    expect(
      compileSynthEventState(
        replaceEventNotes(createSynthEventState(), shorthandCycle),
      ),
    ).toEqual(structured.getSchema().eventPattern);
  });

  it("matches weighted continuations and complete alternation periods", () => {
    const weighted = shorthandVariations("1@3 2 3");
    expect(weighted.patterns[0]).toEqual([
      { type: "event", values: [1] },
      { type: "continuation" },
      { type: "continuation" },
      { type: "event", values: [2] },
      { type: "event", values: [3] },
    ]);

    expect(shorthandNotes("<0@2 2 3>")).toEqual(decodeNotesInput([0, 0, 2, 3]));
  });

  it("keeps continuations transparent to candidate ordinals while rests filter them", () => {
    const structured = new Synthesizer()
      .xox([1, 1, 1, 1])
      .notes([60, null, 67])
      .getSchema().eventPattern;
    const notes = shorthandNotes("60 ~ 67");
    const shorthandTiming = evaluateXoxShorthand("1 1 1 1");
    const state = replaceEventNotes(
      replaceEventTiming(createSynthEventState(), shorthandTiming),
      notes,
    );
    expect(compileSynthEventState(state)).toEqual(structured);

    const continued = replaceEventNotes(
      replaceEventTiming(
        createSynthEventState(),
        evaluateXoxShorthand("1 1 1 1 1"),
      ),
      shorthandNotes("60@3 67"),
    );
    const compiled = compileSynthEventState(continued);
    expect(compiled.timing.cycle[0]).toHaveLength(5);
    expect(compiled.notes).toEqual({
      type: "static",
      cycle: [[[60], [67], [60], [67], [60]]],
    });
  });
});

describe("structured and shorthand consumer schema equivalence", () => {
  it("matches shorthand notes with the structured synth schema", () => {
    const structured = new Synthesizer().notes([60, 64]).getSchema();
    const state = replaceEventNotes(
      createSynthEventState(),
      shorthandNotes("60 64"),
    );
    expect(compileSynthEventState(state)).toEqual(structured.eventPattern);
  });

  it("matches shorthand names with the structured sampler schema", () => {
    const structured = new Sampler("bd").name(["bd", "sd"]).getSchema();
    const state = replaceSampleNames(
      createSamplerEventState("bd"),
      shorthandNames("bd sd"),
    );
    expect(compileSamplerEventState(state)).toEqual(structured.eventPattern);
  });

  it("matches shorthand variations with the structured sampler schema", () => {
    const structured = new Sampler("bd").variation([0, 2]).getSchema();
    const state = replaceEventVariation(
      createSamplerEventState("bd"),
      shorthandVariations("0 2"),
    );
    expect(compileSamplerEventState(state)).toEqual(structured.eventPattern);
  });

  it("matches shorthand XOX with the structured timing schema", () => {
    const structured = new Synthesizer().xox([1, 0, 1]).getSchema();
    const state = replaceEventTiming(
      createSynthEventState(),
      evaluateXoxShorthand("1 0 1"),
    );
    expect(compileSynthEventState(state)).toEqual(structured.eventPattern);
    expect(state.timing.cycle).toEqual(decodeXoxInput([[1, 0, 1]]).cycle);
  });
});
