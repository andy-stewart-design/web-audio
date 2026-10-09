import {
  evaluatePatternExpression,
  getEventPatternGeometry,
  parseShorthand,
} from "@web-audio/patterns";
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

  it("matches nested allocation and polyphonic voice order", () => {
    const nested = shorthandNotes("0 [1 2]");
    expect(nested.patterns[0]).toEqual([
      { type: "event", values: [0] },
      { type: "continuation" },
      { type: "event", values: [1] },
      { type: "event", values: [2] },
    ]);
    expect(getEventPatternGeometry(nested.patterns[0])).toEqual([
      {
        offset: { numerator: 0, denominator: 1 },
        duration: { numerator: 1, denominator: 2 },
        values: [0],
      },
      {
        offset: { numerator: 1, denominator: 2 },
        duration: { numerator: 1, denominator: 4 },
        values: [1],
      },
      {
        offset: { numerator: 3, denominator: 4 },
        duration: { numerator: 1, denominator: 4 },
        values: [2],
      },
    ]);
    expect(
      compileSynthEventState(
        replaceEventNotes(createSynthEventState(), nested),
      ),
    ).toEqual({
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.5 },
            { offset: 0.5, duration: 0.25 },
            { offset: 0.75, duration: 0.25 },
          ],
        ],
        condition: undefined,
      },
      notes: { type: "static", cycle: [[[0], [1], [2]]] },
    });
    expect(shorthandNotes("[0,2,4]")).toEqual(decodeNotesInput([[[0, 2, 4]]]));
    const structured = new Synthesizer().notes([[0, 2, 2]]).getSchema();
    const state = replaceEventNotes(
      createSynthEventState(),
      shorthandNotes("[0,2,2]"),
    );
    expect(compileSynthEventState(state)).toEqual(structured.eventPattern);
    expect(compileSynthEventState(state).notes).toEqual({
      type: "static",
      cycle: [[[0, 2, 2]]],
    });
  });

  it("matches structural repetition with its structured equivalent", () => {
    expect(shorthandVariations("1!2")).toEqual(decodeVariationsInput([[1, 1]]));
  });

  it("matches repetition, speed cancellation, and weighted alternation operators", () => {
    const repeated = shorthandNotes("0!2 1");
    expect(repeated).toEqual(decodeNotesInput([[0, 0, 1]]));
    expect(
      compileSynthEventState(
        replaceEventNotes(createSynthEventState(), repeated),
      ),
    ).toEqual(new Synthesizer().notes([0, 0, 1]).getSchema().eventPattern);

    const cancelled = shorthandNotes("[0 2]*2/2");
    const structured = decodeNotesInput([[0, 2]]);
    expect(cancelled).toEqual(structured);
    expect(
      getEventPatternGeometry(cancelled.patterns[0]).map(
        ({ offset, duration, values }) => ({ offset, duration, values }),
      ),
    ).toEqual([
      {
        offset: { numerator: 0, denominator: 1 },
        duration: { numerator: 1, denominator: 2 },
        values: [0],
      },
      {
        offset: { numerator: 1, denominator: 2 },
        duration: { numerator: 1, denominator: 2 },
        values: [2],
      },
    ]);
    expect(
      compileSynthEventState(
        replaceEventNotes(createSynthEventState(), cancelled),
      ),
    ).toEqual(new Synthesizer().notes([0, 2]).getSchema().eventPattern);

    const weightedAlternation = shorthandNotes("<0@2 2 3>*2");
    const weightedStructured = decodeNotesInput([
      [0, 0],
      [2, 3],
    ]);
    expect(weightedAlternation).toEqual(weightedStructured);
    expect(
      compileSynthEventState(
        replaceEventNotes(createSynthEventState(), weightedAlternation),
      ),
    ).toEqual(new Synthesizer().notes([0, 0], [2, 3]).getSchema().eventPattern);
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
    expect(getEventPatternGeometry(weighted.patterns[0])).toEqual([
      {
        offset: { numerator: 0, denominator: 1 },
        duration: { numerator: 3, denominator: 5 },
        values: [1],
      },
      {
        offset: { numerator: 3, denominator: 5 },
        duration: { numerator: 1, denominator: 5 },
        values: [2],
      },
      {
        offset: { numerator: 4, denominator: 5 },
        duration: { numerator: 1, denominator: 5 },
        values: [3],
      },
    ]);
    const compiled = compileSynthEventState(
      replaceEventNotes(createSynthEventState(), shorthandNotes("0@3 2 3")),
    );
    expect(compiled.timing.cycle[0].map(({ duration }) => duration)).toEqual([
      0.6, 0.2, 0.2,
    ]);
    expect(compiled.notes).toEqual({
      type: "static",
      cycle: [[[0], [2], [3]]],
    });

    expect(shorthandNotes("<0@2 2 3>")).toEqual(decodeNotesInput([0, 0, 2, 3]));
  });

  it("matches nested and independent alternations over their complete periods", () => {
    const nested = shorthandNotes("<0 <2 3>>");
    const nestedStructured = decodeNotesInput([0, 2, 0, 3]);
    expect(nested).toEqual(nestedStructured);
    expect(
      compileSynthEventState(
        replaceEventNotes(createSynthEventState(), nested),
      ),
    ).toEqual(new Synthesizer().notes(0, 2, 0, 3).getSchema().eventPattern);

    const independentStructured = [
      [0, 2],
      [1, 3],
      [0, 4],
      [1, 2],
      [0, 3],
      [1, 4],
    ];
    const independent = shorthandNotes("<0 1> <2 3 4>");
    expect(independent).toEqual(decodeNotesInput(independentStructured));
    expect(
      compileSynthEventState(
        replaceEventNotes(createSynthEventState(), independent),
      ),
    ).toEqual(
      new Synthesizer().notes(...independentStructured).getSchema()
        .eventPattern,
    );
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
  it("matches authored rests in sampler names and variations under external timing", () => {
    const timing = [1, 1, 1, 1];
    const structuredNames = new Sampler("bd")
      .xox(timing)
      .name(["bd", null, "sd"])
      .getSchema().eventPattern;
    const shorthandNamesState = replaceSampleNames(
      replaceEventTiming(
        createSamplerEventState("bd"),
        evaluateXoxShorthand("1 1 1 1"),
      ),
      shorthandNames("bd ~ sd"),
    );
    const shorthandNamesPattern = compileSamplerEventState(shorthandNamesState);
    expect(shorthandNamesPattern).toEqual(structuredNames);
    expect(shorthandNamesPattern.timing.cycle).toEqual([
      [
        { offset: 0, duration: 0.25 },
        { offset: 0.5, duration: 0.25 },
        { offset: 0.75, duration: 0.25 },
      ],
    ]);
    expect(shorthandNamesPattern.sampleNames).toEqual({
      type: "static",
      cycle: [[["bd"], ["sd"]]],
    });

    const structuredVariations = new Sampler("bd")
      .xox(timing)
      .var([0, null, 2])
      .getSchema().eventPattern;
    const shorthandVariationsState = replaceEventVariation(
      replaceEventTiming(
        createSamplerEventState("bd"),
        evaluateXoxShorthand("1 1 1 1"),
      ),
      shorthandVariations("0 ~ 2"),
    );
    const shorthandVariationsPattern = compileSamplerEventState(
      shorthandVariationsState,
    );
    expect(shorthandVariationsPattern).toEqual(structuredVariations);
    expect(shorthandVariationsPattern.timing.cycle).toEqual(
      shorthandNamesPattern.timing.cycle,
    );
    expect(shorthandVariationsPattern.variationIndices).toEqual({
      type: "static",
      cycle: [[[0], [2]]],
    });
  });

  it("matches shorthand slowdown with external timing and filters the silent bar", () => {
    const structured = new Sampler("bd")
      .var(1)
      .slow(2)
      .xox([1, 1])
      .getSchema().eventPattern;
    const state = replaceEventVariation(
      replaceEventTiming(
        createSamplerEventState("bd"),
        evaluateXoxShorthand("1 1"),
      ),
      shorthandVariations("1/2"),
    );
    const compiled = compileSamplerEventState(state);
    expect(compiled).toEqual(structured);
    expect(compiled.timing.cycle).toEqual([
      [
        { offset: 0, duration: 0.5 },
        { offset: 0.5, duration: 0.5 },
      ],
      [],
    ]);
    expect(compiled.variationIndices).toEqual({
      type: "static",
      cycle: [[[1]], [null]],
    });
  });

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

    const compact = evaluateXoxShorthand("xoxo");
    const general = evaluateXoxShorthand("1 0 1 0");
    expect(compact).toEqual(general);
    expect(
      compileSynthEventState(
        replaceEventTiming(createSynthEventState(), compact),
      ),
    ).toEqual(
      compileSynthEventState(
        replaceEventTiming(createSynthEventState(), general),
      ),
    );
  });
});
