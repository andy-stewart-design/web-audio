import { describe, expect, it } from "vitest";
import {
  RandomCycle,
  getEventPatternGeometry,
  type EventCycleTransform,
  type StaticEventCycle,
} from "@web-audio/patterns";
import {
  decodeNotesInputGeometry,
  decodeSampleNamesInput,
  decodeVariationsInput,
  decodeVariationsInputGeometry,
} from "@/inputs/decode-structured-input";
import { decodeXoxInputGeometry } from "@/inputs/decode-xox-input";
import type { InstrumentEventState, SamplerEventState } from "@/events/state";
import {
  createSamplerEventState,
  createSynthEventState,
  replaceEventNotes,
  replaceSampleNames,
  replaceEventVariation,
  replaceEventTiming,
  composeEventTiming,
  setEventRoot,
  setEventScale,
  transformEventState,
} from "@/events/transitions";
import {
  getFixedAvailability,
  getFilteredEventTiming,
  getSelectedEventTiming,
  makeCycle,
} from "@/events/geometry";
import Sampler from "./sampler";
import Synthesizer from "./synthesizer";
import AuthoredEventValues from "@/patterns/authored-event-values";
import { getSamplerEventTiming } from "./event-compiler";

// Temporary oracle only. Inspect independently initialized legacy state without
// passing any legacy data to native helpers or reconstructing native state.
class LegacySampler extends Sampler {
  inspectTiming() {
    const variation: unknown = Reflect.get(this, "_variation");
    const sampleNames: unknown = Reflect.get(this, "_sampleNames");
    if (
      !(variation instanceof AuthoredEventValues) ||
      !(sampleNames instanceof AuthoredEventValues)
    )
      throw new Error("Expected legacy sampler lanes");
    return getSamplerEventTiming({
      pitches: this._pitches,
      timing: this._timing,
      variation,
      sampleNames,
    });
  }
}

const event = <T>(...values: [T, ...T[]]) =>
  ({ type: "event", values }) as const;
const rest = { type: "rest" } as const;
const reverse = { type: "reverse" } as const;
const slow = { type: "slow", multiplier: 2 } as const;
const operations: EventCycleTransform[] = [
  reverse,
  { type: "fast", multiplier: 2 },
  slow,
  { type: "stretch", bars: 2, steps: 2 },
];

function notes(state: InstrumentEventState, input: readonly unknown[]) {
  const decoded = decodeNotesInputGeometry(input);
  return replaceEventNotes(
    state,
    decoded.cycle,
    decoded.zeroWidthPatterns,
    "noteValueSlots" in decoded ? decoded.noteValueSlots : undefined,
  );
}
function samplerNotes(state: SamplerEventState, input: readonly unknown[]) {
  const result = notes(state, input);
  if (result.type !== "sampler") throw new Error("Expected sampler");
  return result;
}
function timing(
  state: InstrumentEventState,
  input: readonly unknown[],
  compose = false,
) {
  const decoded = decodeXoxInputGeometry(input);
  return compose
    ? composeEventTiming(state, decoded.cycle, decoded.zeroWidthPatterns)
    : replaceEventTiming(
        state,
        decoded.cycle,
        decoded.condition,
        decoded.zeroWidthPatterns,
      );
}
function samplerTiming(
  state: SamplerEventState,
  input: readonly unknown[],
  compose = false,
) {
  const result = timing(state, input, compose);
  if (result.type !== "sampler") throw new Error("Expected sampler");
  return result;
}
function geometry<T>(cycle: StaticEventCycle<T>) {
  return cycle.patterns.map((pattern) =>
    getEventPatternGeometry(pattern).map(({ offset, duration }) => ({
      offset:
        offset.numerator *
        (pattern.length / offset.denominator) *
        (1 / pattern.length),
      duration: duration.numerator / duration.denominator,
    })),
  );
}
function staticNotes(state: InstrumentEventState) {
  if (state.notes.cycle.type !== "static-event-cycle")
    throw new Error("Expected static notes");
  return state.notes.cycle;
}
function assertFrozen(value: unknown) {
  if (!value || typeof value !== "object") return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) assertFrozen(child);
}

describe("native constructors and setters", () => {
  it("constructs independent deeply frozen defaults and absent sampler names", () => {
    const synth = createSynthEventState();
    const sampler = createSamplerEventState(" bd ");
    expect(synth.notes).toMatchObject({ intent: "default", fallback: [60] });
    expect(sampler.notes).toMatchObject({ intent: "default", fallback: [0] });
    expect(sampler.variation).toMatchObject({
      intent: "default",
      fallback: [0],
    });
    expect(sampler.sampleNames).toMatchObject({
      intent: "default",
      fallback: ["bd"],
    });
    expect(createSamplerEventState().sampleNames).toBeUndefined();
    expect(createSynthEventState()).not.toBe(synth);
    expect(synth.pitch).toEqual({
      root: 0,
      scale: undefined,
      hasRequestedTransform: false,
    });
    assertFrozen(synth);
    assertFrozen(sampler);
  });

  it("equal-value setters replace defaults with authored intent and only their own lane", () => {
    const initial = createSamplerEventState("bd");
    const authored = replaceEventVariation(
      replaceSampleNames(
        samplerNotes(initial, [0]),
        decodeSampleNamesInput(["bd"]),
      ),
      decodeVariationsInput([0]),
    );
    expect(authored.notes.intent).toBe("authored");
    expect(authored.sampleNames?.intent).toBe("authored");
    expect(authored.variation.intent).toBe("authored");
    expect(authored.timing).toEqual(initial.timing);
    expect(authored.pitch).toEqual(initial.pitch);
    const replaced = replaceEventVariation(
      authored,
      decodeVariationsInput([[1, 2]]),
    );
    expect(replaced.notes).toEqual(authored.notes);
    expect(replaced.sampleNames).toEqual(authored.sampleNames);
    expect(authored.variation.cycle).toEqual(decodeVariationsInput([0]));
    assertFrozen(replaced);
  });

  it("root and scale preserve geometry and explicitly request even root(0)", () => {
    const initial = samplerNotes(createSamplerEventState("bd"), [[0, -1, 2]]);
    const result = setEventScale(setEventRoot(initial, "c4"), "maj");
    expect(result.pitch).toEqual({
      root: 60,
      scale: [0, 2, 4, 5, 7, 9, 11],
      hasRequestedTransform: true,
    });
    expect(result.notes).toEqual(initial.notes);
    expect(result.timing).toEqual(initial.timing);
    expect(
      setEventRoot(createSamplerEventState("bd"), 0).pitch
        .hasRequestedTransform,
    ).toBe(true);
    assertFrozen(result);
  });

  it.each(operations)(
    "$type respects setters before and after transforms",
    (operation) => {
      const input = createSamplerEventState("bd");
      const before = transformEventState(
        samplerNotes(input, [[60, 64]]),
        operation,
      );
      const after = samplerNotes(transformEventState(input, operation), [
        [60, 64],
      ]);
      expect(staticNotes(after).patterns).toEqual([[event(60), event(64)]]);
      expect(before.notes.cycle).not.toEqual(after.notes.cycle);
      const replaced = replaceEventVariation(
        replaceSampleNames(before, decodeSampleNamesInput([["bd", "sd"]])),
        decodeVariationsInput([[1, 2]]),
      );
      expect(replaced.sampleNames?.cycle.patterns).toEqual([
        [event("bd"), event("sd")],
      ]);
      expect(replaced.variation.cycle).toEqual(decodeVariationsInput([[1, 2]]));
      expect(input).toEqual(createSamplerEventState("bd"));
      assertFrozen(before);
      assertFrozen(after);
      assertFrozen(replaced);
    },
  );

  it("snapshots caller-owned cycle and chance metadata without freezing or aliasing them", () => {
    const group: [number, ...number[]] = [60, 64];
    const cycle = {
      type: "static-event-cycle",
      patterns: [[event(...group)]],
    } as const;
    const condition = {
      type: "chance",
      probability: 0.25,
      segments: [{ seed: 7, len: 8 }],
      order: "forward",
      algorithm: "xor",
    } as const;
    const initial = createSynthEventState();
    const result = replaceEventTiming(
      replaceEventNotes(initial, cycle),
      decodeXoxInputGeometry([[1, 0]]).cycle,
      condition,
    );
    Reflect.set(cycle.patterns[0][0].values, "0", 99);
    Reflect.set(condition.segments[0], "seed", 99);
    expect(staticNotes(result).patterns).toEqual([[event(60, 64)]]);
    expect(result.timing.condition?.segments[0].seed).toBe(7);
    expect(Object.isFrozen(condition)).toBe(false);
    expect(Object.isFrozen(cycle.patterns[0])).toBe(false);
    assertFrozen(result);
  });
});

describe("availability and materialization feasibility", () => {
  it.each(["notes", "variation"] as const)(
    "%s keeps inherited gaps transparent through timing and unrelated setters",
    (lane) => {
      let state = createSamplerEventState("bd");
      state =
        lane === "notes"
          ? samplerNotes(state, [[60, 64]])
          : replaceEventVariation(state, decodeVariationsInput([[0, 2]]));
      state = transformEventState(samplerTiming(state, [[1, 0, 1]]), reverse);
      expect(getFixedAvailability(state[lane])).toEqual([[true, true]]);
      expect(state[lane]).toMatchObject({
        availability: { intent: "aligned" },
      });
      state = replaceSampleNames(state, decodeSampleNamesInput(["bd"]));
      expect(getFixedAvailability(state[lane])).toEqual([[true, true]]);
      state = samplerTiming(state, [[1, 1, 1, 1]]);
      expect(getFixedAvailability(state[lane])).toEqual([[true, true]]);
      expect(geometry(getFilteredEventTiming(state).cycle)).toEqual([
        [0, 0.25, 0.5, 0.75].map((offset) => ({ offset, duration: 0.25 })),
      ]);
    },
  );

  it.each(["notes", "variation"] as const)(
    "%s releases slowdown gaps as rests, but not inherited timing gaps",
    (lane) => {
      let state = createSamplerEventState("bd");
      state =
        lane === "notes"
          ? samplerNotes(state, [[60, 64]])
          : replaceEventVariation(state, decodeVariationsInput([[0, 2]]));
      state = transformEventState(samplerTiming(state, [[1, 0, 1]]), slow);
      state = samplerTiming(state, [[1, 1, 1, 1]]);
      expect(getFixedAvailability(state[lane])).toEqual([
        [true, false],
        [false, true, false],
      ]);
      expect(geometry(getFilteredEventTiming(state).cycle)).toEqual([
        [
          { offset: 0, duration: 0.25 },
          { offset: 0.5, duration: 0.25 },
        ],
        [{ offset: 0.25, duration: 0.25 }],
      ]);
    },
  );

  it("authored rests survive materialization and later timing replacement", () => {
    let state = samplerNotes(createSamplerEventState("bd"), [[60, null, 64]]);
    state = transformEventState(samplerTiming(state, [[1, 1, 1, 1]]), reverse);
    expect(getFixedAvailability(state.notes)).toEqual([
      [true, true, false, true],
    ]);
    state = samplerTiming(state, [[1, 1, 1, 1]]);
    expect(getFixedAvailability(state.notes)).toEqual([
      [true, true, false, true],
    ]);
    expect(
      geometry(getFilteredEventTiming(state).cycle)[0].map(
        (step) => step.offset,
      ),
    ).toEqual([0, 0.25, 0.75]);
    expect(staticNotes(state).patterns).toEqual([
      [event(64), rest, rest, event(60)],
    ]);
  });

  it("coordinated lanes share an intersection without filtering it twice across repeated transforms", () => {
    let state = replaceEventVariation(
      samplerNotes(createSamplerEventState("bd"), [[60, null, 64]]),
      decodeVariationsInput([[0, null, 2]]),
    );
    state = transformEventState(state, reverse);
    expect(staticNotes(state).patterns).toEqual([[rest, rest, event(60)]]);
    expect(state.variation.cycle).toEqual(makeCycle([[rest, rest, event(0)]]));
    if (
      state.notes.intent !== "authored" ||
      state.variation.intent !== "authored"
    )
      throw new Error("Expected authored");
    expect(state.notes.materializedTiming).toBe(
      state.variation.materializedTiming,
    );
    expect(geometry(getFilteredEventTiming(state).cycle)).toEqual([
      [{ offset: 2 / 3, duration: 1 / 3 }],
    ]);
    state = transformEventState(state, reverse);
    expect(geometry(getFilteredEventTiming(state).cycle)).toEqual([
      [{ offset: 0, duration: 1 / 3 }],
    ]);
    expect(getFixedAvailability(state.notes)).toEqual([[true, false, true]]);
    expect(getFixedAvailability(state.variation)).toEqual([[true, false]]);
  });

  it.each([null, undefined, [], [null, undefined]])(
    "structured rest slot %j remains a value slot during note materialization",
    (placeholder) => {
      const state = transformEventState(
        notes(createSynthEventState(), [[60, placeholder, 64]]),
        reverse,
      );
      expect(staticNotes(state).patterns).toEqual([[rest, rest, event(60)]]);
      if (state.notes.intent !== "authored")
        throw new Error("Expected authored");
      expect(state.notes.noteValueSlots?.patterns).toEqual([
        [event(1), rest, event(1)],
      ]);
      const legacy = new Synthesizer()
        .notes([60, placeholder, 64])
        .reverse()
        .getSchema().eventPattern;
      expect(geometry(staticNotes(state))).toEqual(legacy.timing.cycle);
      expect(legacy.notes).toEqual({ type: "static", cycle: [[[60]]] });
    },
  );

  it("variation rests skip value slots, unlike note placeholders", () => {
    const state = transformEventState(
      replaceEventVariation(
        createSamplerEventState("bd"),
        decodeVariationsInput([[0, null, 2]]),
      ),
      reverse,
    );
    expect(state.variation.cycle).toEqual(
      makeCycle([[event(2), rest, event(0)]]),
    );
  });

  it("original one-slot notes stay exempt from materialization after slowdown", () => {
    let state = samplerNotes(createSamplerEventState("bd"), [60]);
    state = transformEventState(state, slow);
    state = samplerTiming(state, [[1, 1, 1, 1]]);
    state = transformEventState(state, reverse);
    expect(staticNotes(state).patterns).toEqual([[rest], [event(60)]]);
    expect(getFixedAvailability(state.notes)).toEqual([[false], [true]]);
  });

  it("default fallbacks stay non-filtering while their cycles transform", () => {
    const initial = createSamplerEventState("bd");
    const state = samplerTiming(transformEventState(initial, slow), [[1, 1]]);
    expect(state.notes).toMatchObject({
      intent: "default",
      fallback: [0],
      cycle: { patterns: [[event(0)], [rest]] },
    });
    expect(state.sampleNames).toMatchObject({
      intent: "default",
      fallback: ["bd"],
      cycle: { patterns: [[event("bd")], [rest]] },
    });
    expect(getFixedAvailability(state.notes)).toBeUndefined();
    expect(getFixedAvailability(state.sampleNames!)).toBeUndefined();
    expect(geometry(getFilteredEventTiming(state).cycle)[0]).toHaveLength(2);
  });

  it("empty note bars are transparent availability, not authored-rest priority", () => {
    let state = samplerNotes(createSamplerEventState("bd"), [[], [60]]);
    state = replaceEventVariation(state, decodeVariationsInput([[0, 1]]));
    expect(getFixedAvailability(state.notes)).toEqual([[true], [true]]);
    expect(getSelectedEventTiming(state).source).toBe("variation");
    const restState = replaceEventVariation(
      samplerNotes(createSamplerEventState("bd"), [[null], [60]]),
      decodeVariationsInput([[0, 1]]),
    );
    expect(getSelectedEventTiming(restState).source).toBe("notes");
  });

  it("zero-width note bars compress without shortening gates; explicit rests retain width", () => {
    // Generated timing exempts the pre-transform materialization that otherwise
    // turns both silent note bars into zero-width materialized bars.
    const context = {
      timingOverride: { cycle: [[{ offset: 0, duration: 2 }], []] },
    };
    const empty = transformEventState(
      samplerNotes(createSamplerEventState("bd"), [[60], []]),
      { type: "fast", multiplier: 2 },
      context,
    );
    const explicit = transformEventState(
      samplerNotes(createSamplerEventState("bd"), [[60], [null]]),
      { type: "fast", multiplier: 2 },
      context,
    );
    expect(staticNotes(empty).patterns).toEqual([[event(60)]]);
    expect(staticNotes(explicit).patterns).toEqual([[event(60), rest]]);
    expect(geometry(staticNotes(empty))).toEqual([
      [{ offset: 0, duration: 1 }],
    ]);
  });
});

describe("transition validation and budgets", () => {
  it("bounds repeated timing composition before allocating the expanded grid", () => {
    const state = timing(createSynthEventState(), [1, 1, 1]);
    const wide = makeCycle<1>([Array.from({ length: 8193 }, () => rest)]);
    expect(() => composeEventTiming(state, wide)).toThrow(
      "Timing composition produces more than 16384 steps",
    );
    expect(state.timing.cycle.patterns).toHaveLength(3);
  });

  it("rejects malformed note-slot geometry and chance metadata without mutating inputs", () => {
    const state = createSynthEventState();
    const cycle = makeCycle([[event(60)]]);
    const slots = makeCycle<1>([[event(1), event(1)]]);
    expect(() => replaceEventNotes(state, cycle, undefined, slots)).toThrow(
      "Note value slots must match static note geometry",
    );
    const condition = {
      type: "chance",
      probability: 2,
      segments: [{ seed: 7 }],
      algorithm: "xor",
      order: "forward",
    } as const;
    expect(() =>
      replaceEventTiming(state, makeCycle<1>([[event(1)]]), condition),
    ).toThrow("chance probability");
    expect(state).toEqual(createSynthEventState());
    expect(condition.probability).toBe(2);
    expect(Object.isFrozen(condition)).toBe(false);
  });
});

describe("timing, random lanes, and generated overrides", () => {
  it("fixed timing composes in call order and stays explicit after value replacement", () => {
    let state = timing(createSynthEventState(), [[1, 0]], true);
    state = timing(state, [[1, 1, 0, 1]], true);
    expect(state.timing.cycle.patterns).toEqual([
      [event(1), rest, rest, event(1)],
    ]);
    const replaced = notes(state, [[67, 69]]);
    expect(replaced.timing).toEqual(state.timing);
    expect(replaced.timing.intent).toBe("explicit");
    expect(geometry(state.timing.cycle)).toEqual(
      new Synthesizer().xox([1, 0]).xox([1, 1, 0, 1]).getSchema().eventPattern
        .timing.cycle,
    );
  });

  it.each(["synth", "sampler", "generated"] as const)(
    "%s applies fluent speeds immediately, regardless of intermediate reads",
    (kind) => {
      const initial = timing(
        notes(
          kind === "synth"
            ? createSynthEventState()
            : createSamplerEventState("bd"),
          [60],
        ),
        [1],
      );
      const context =
        kind === "generated"
          ? { timingOverride: { cycle: [[{ offset: 0, duration: 2 }], []] } }
          : undefined;
      const accelerated = transformEventState(
        initial,
        { type: "fast", multiplier: 2 },
        context,
      );
      expect(staticNotes(accelerated).patterns).toEqual([
        [event(60), event(60)],
      ]);
      expect(geometry(staticNotes(accelerated))).toEqual([
        [
          { offset: 0, duration: 0.5 },
          { offset: 0.5, duration: 0.5 },
        ],
      ]);
      const uninterrupted = transformEventState(accelerated, slow, context);
      const beforeReads = structuredClone(accelerated);
      for (let read = 0; read < 3; read++) {
        geometry(staticNotes(accelerated));
        getSelectedEventTiming(accelerated);
        getFilteredEventTiming(accelerated);
        getFixedAvailability(accelerated.notes);
      }
      expect(accelerated).toEqual(beforeReads);
      const observed = transformEventState(accelerated, slow, context);
      expect(observed).toEqual(uninterrupted);
      expect(staticNotes(observed).patterns).toEqual([
        [event(60), rest],
        [event(60), rest],
      ]);
      expect(geometry(staticNotes(observed))).toEqual([
        [{ offset: 0, duration: 0.5 }],
        [{ offset: 0, duration: 0.5 }],
      ]);
      expect(observed.timing.cycle.patterns).toEqual([
        [event(1), rest],
        [event(1), rest],
      ]);
      // Replacing rhythm does not retroactively cancel or reapply note speeds.
      const replaced = timing(observed, [
        new RandomCycle().bin().steps(1).chance(1),
      ]);
      expect(replaced.notes).toEqual(observed.notes);
      expect(replaced.timing.cycle.patterns).toEqual([[event(1)]]);
      assertFrozen(observed);
    },
  );

  it("generated timing exempts alignment, not immediate transforms on coordinated value lanes", () => {
    const initial = replaceEventVariation(
      replaceSampleNames(
        samplerNotes(createSamplerEventState("bd"), [[60, 64]]),
        decodeSampleNamesInput([["bd", "sd"]]),
      ),
      decodeVariationsInput([[0, 2]]),
    );
    const override = { cycle: [[{ offset: 0, duration: 2 }], []] };
    const beforeOverride = structuredClone(override);
    const context = { timingOverride: override };
    const accelerated = transformEventState(
      initial,
      { type: "fast", multiplier: 2 },
      context,
    );
    const result = transformEventState(accelerated, slow, context);
    expect(staticNotes(result).patterns).toEqual([
      [event(60), rest, event(64), rest],
      [event(60), rest, event(64), rest],
    ]);
    expect(result.sampleNames?.cycle.patterns).toEqual([
      [event("bd"), rest, event("sd"), rest],
      [event("bd"), rest, event("sd"), rest],
    ]);
    expect(result.variation.cycle).toEqual(
      makeCycle([
        [event(0), rest, event(2), rest],
        [event(0), rest, event(2), rest],
      ]),
    );
    expect(geometry(staticNotes(result))).toEqual([
      [
        { offset: 0, duration: 0.25 },
        { offset: 0.5, duration: 0.25 },
      ],
      [
        { offset: 0, duration: 0.25 },
        { offset: 0.5, duration: 0.25 },
      ],
    ]);
    expect(override).toEqual(beforeOverride);
    expect(result).not.toHaveProperty("timingOverride");
    assertFrozen(result);
  });

  it("timing composition wraps to the longer phrase, not its LCM", () => {
    const state = timing(
      timing(createSynthEventState(), [1, 0], true),
      [1, 1, 1],
      true,
    );
    expect(state.timing.cycle.patterns).toEqual([
      [event(1)],
      [rest],
      [event(1)],
    ]);
  });

  it("random timing replacement retains one chance through fixed composition and reverses its order once", () => {
    const source = new RandomCycle()
      .bin()
      .steps(2, 0)
      .chance(0.25)
      .ribbon(7, 8);
    const state = transformEventState(
      timing(timing(createSynthEventState(), [source]), [[1, 0, 1]], true),
      reverse,
    );
    expect(state.timing.condition).toMatchObject({
      probability: 0.25,
      order: "reverse",
      segments: [{ seed: 7, len: 8 }],
    });
    expect(transformEventState(state, reverse).timing.condition?.order).toBe(
      "forward",
    );
    expect(source.getTimingCondition().order).toBe("forward");
  });

  it("retains random variation zero-width bars through acceleration", () => {
    const decoded = decodeVariationsInputGeometry([
      new RandomCycle().int().steps(2, 0),
    ]);
    const state = transformEventState(
      replaceEventVariation(
        createSamplerEventState("bd"),
        decoded.cycle,
        decoded.zeroWidthPatterns,
      ),
      { type: "fast", multiplier: 2 },
    );
    if (state.variation.cycle.type !== "random-event-cycle")
      throw new Error("Expected random variation");
    expect(state.variation.cycle.candidateCycle.patterns).toEqual([
      [event(1), event(1)],
    ]);
    expect(geometry(getFilteredEventTiming(state).cycle)).toEqual([
      [
        { offset: 0, duration: 0.5 },
        { offset: 0.5, duration: 0.5 },
      ],
    ]);
  });

  it.each(operations)(
    "$type transforms random candidate geometry without generating values",
    (operation) => {
      const random = new RandomCycle()
        .int()
        .steps(2, 0)
        .range(-2, 8)
        .ribbon(7, 8);
      const state = transformEventState(
        replaceEventVariation(
          samplerNotes(createSamplerEventState("bd"), [random]),
          decodeVariationsInput([new RandomCycle().int().steps(2, 0)]),
        ),
        operation,
      );
      if (state.notes.cycle.type !== "random-event-cycle")
        throw new Error("Expected random");
      expect(state.notes.cycle.settings).toMatchObject({
        range: { min: -2, max: 8 },
        segments: [{ seed: 7, len: 8 }],
        order: operation.type === "reverse" ? "reverse" : "forward",
      });
      expect(state.notes.cycle).not.toHaveProperty("values");
      assertFrozen(state);
    },
  );

  it.each(["chop", "fit"])(
    "%s overrides exempt materialization and allow cross-bar generated gates",
    () => {
      const initial = samplerTiming(
        replaceEventVariation(
          samplerNotes(createSamplerEventState("bd"), [[60, 64]]),
          decodeVariationsInput([[0, 2]]),
        ),
        [[1, 0, 1]],
      );
      const override = { cycle: [[{ offset: 0, duration: 2 }], []] };
      const before = structuredClone(override);
      const state = transformEventState(initial, reverse, {
        timingOverride: override,
      });
      expect(staticNotes(state).patterns).toEqual([[event(64), event(60)]]);
      expect(state.variation.cycle).toEqual(makeCycle([[event(2), event(0)]]));
      expect(state.timing.cycle.patterns).toEqual([[event(1), rest, event(1)]]);
      expect(override).toEqual(before);
      expect(Object.isFrozen(override)).toBe(false);
      expect(state).not.toHaveProperty("timingOverride");
    },
  );
});

// Step 4.5 adds complete-schema replay. These bounded prefix comparisons test
// transition geometry against independently initialized public legacy facades.
describe("temporary transition timing comparisons", () => {
  it("replays reproducible setter/transform prefixes including timing replacement", () => {
    for (let seed = 1; seed <= 32; seed++) {
      let state = createSamplerEventState("bd");
      const legacy = new LegacySampler("bd");
      let random = seed;
      const sequence: string[] = [];
      for (let index = 0; index < 8; index++) {
        random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
        const choice = (random >>> 16) % 8;
        sequence.push(String(choice));
        switch (choice) {
          case 0:
            state = samplerNotes(state, [[60, null, 64]]);
            legacy.notes([60, null, 64]);
            break;
          case 1:
            state = replaceEventVariation(
              state,
              decodeVariationsInput([[0, null, 2]]),
            );
            legacy.variation([0, null, 2]);
            break;
          case 2:
            state = replaceSampleNames(
              state,
              decodeSampleNamesInput([["bd", null, "sd"]]),
            );
            legacy.name(["bd", null, "sd"]);
            break;
          case 3:
            state = samplerTiming(state, [[1, 0, 1]], true);
            legacy.xox([1, 0, 1]);
            break;
          case 4:
            state = samplerTiming(state, [
              new RandomCycle().bin().steps(4).chance(1),
            ]);
            legacy.xox(new RandomCycle().bin().steps(4).chance(1));
            break;
          case 5:
            state = transformEventState(state, reverse);
            legacy.reverse();
            break;
          case 6:
            state = transformEventState(state, slow);
            legacy.slow(2);
            break;
          case 7:
            state = transformEventState(state, { type: "fast", multiplier: 2 });
            legacy.fast(2);
            break;
        }
        const expected = legacy.inspectTiming().cycle;
        // Establish a materialized legacy prefix boundary for compatibility
        // comparisons. Native no-read chains follow the spec tests above, not
        // legacy deferred-speed cancellation.
        legacy.getSchema();
        expect(
          geometry(getFilteredEventTiming(state).cycle),
          `seed=${seed}, prefix=${sequence.join(",")}`,
        ).toEqual(expected);
      }
    }
  });
});
