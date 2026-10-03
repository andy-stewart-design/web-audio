import { describe, expect, it, vi } from "vitest";
import {
  getEventPatternGeometry,
  MAX_EVENT_CYCLE_STEPS,
  MAX_RANDOM_EVENT_SETTINGS_ITEMS,
  type RandomEventSettings,
  type EventPattern,
  type NonEmptyGroup,
} from "@web-audio/patterns";
import type {
  ChanceCondition,
  SamplerEventPattern,
  SynthEventPattern,
} from "@web-audio/schema";
import type {
  EventSource,
  SamplerEventState,
  SynthEventState,
} from "@/events/state";
import { makeCycle } from "@/events/geometry";
import {
  compileSamplerEventState,
  compileSynthEventState,
} from "@/events/compiler";
import {
  composeEventTiming,
  replaceEventTiming,
  transformEventState,
} from "@/events/transitions";
import { getChopTiming, getDistributedTiming } from "./sampler-utils";

const event = <T>(...values: [T, ...T[]]) =>
  ({ type: "event", values }) as const;
const rest = { type: "rest" } as const;
const continuation = { type: "continuation" } as const;
const onset = event<1>(1);
const pitch = { root: 0, hasRequestedTransform: false } as const;
const implicit = {
  intent: "implicit",
  cycle: makeCycle<1>([[onset]]),
} as const;
function authored<T>(...patterns: EventPattern<T>[]) {
  return { intent: "authored", cycle: makeCycle(patterns) } as const;
}
function fallback<T>(...values: [T, ...T[]]) {
  return {
    intent: "default",
    fallback: values,
    cycle: makeCycle([[event(...values)]]),
  } as const;
}
function rhythm(...bars: number[][]) {
  return {
    intent: "explicit",
    cycle: makeCycle<1>(
      bars.map((bar) =>
        bar.length === 0
          ? [rest]
          : bar.map((value) => (value === 0 ? rest : onset)),
      ),
    ),
  } as const;
}
function synthState(notes: EventSource<number> = fallback(60)) {
  return {
    type: "synth",
    notes,
    timing: implicit,
    pitch,
  } as const satisfies SynthEventState;
}
function samplerState(overrides: Partial<SamplerEventState> = {}) {
  return {
    type: "sampler",
    notes: fallback(0),
    sampleNames: fallback("bd"),
    variation: fallback(0),
    timing: implicit,
    pitch,
    ...overrides,
  } as const satisfies SamplerEventState;
}
function serial(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as unknown;
}
function expectSchema(
  actual: SynthEventPattern | SamplerEventPattern,
  expected: SynthEventPattern | SamplerEventPattern,
) {
  expect(serial(actual)).toStrictEqual(serial(expected));
}
const hit = (offset: number, duration: number) => ({ offset, duration });
function staticNotes(schema: SynthEventPattern) {
  if (schema.notes.type !== "static") throw new Error("Expected static notes");
  return schema.notes;
}
function randomLane(
  settings: Partial<RandomEventSettings>,
  ...patterns: EventPattern<1>[]
) {
  return {
    intent: "authored",
    cycle: {
      type: "random-event-cycle",
      candidateCycle: makeCycle<1>(patterns),
      settings: {
        dataType: "integer",
        segments: [{ seed: 9 }],
        range: { min: 48, max: 72 },
        algorithm: "xor",
        order: "forward",
        ...settings,
      },
    },
  } as const satisfies EventSource<number>;
}
const chance = {
  type: "chance",
  probability: 0.5,
  segments: [{ seed: 42 }],
  algorithm: "xor",
  order: "forward",
} satisfies ChanceCondition;

describe("native static synth compilation", () => {
  it("matches the default synth golden", () => {
    expectSchema(compileSynthEventState(synthState()), {
      timing: { cycle: [[hit(0, 1)]] },
      notes: { type: "static", cycle: [[[60]]] },
    });
  });

  it("groups ordered duplicate voices, keeps zero/fractions, and excludes authored rests", () => {
    const state = synthState(
      authored([event(60), event(64, 67, 64), rest, event(0), event(-1.5)]),
    );
    expectSchema(compileSynthEventState(state), {
      timing: {
        cycle: [[hit(0, 0.2), hit(0.2, 0.2), hit(3 * 0.2, 0.2), hit(0.8, 0.2)]],
      },
      notes: { type: "static", cycle: [[[60], [64, 67, 64], [0], [-1.5]]] },
    });
  });

  it("matches the explicit timing and silent note bar golden", () => {
    const state = {
      ...synthState(authored([event(60)], [rest], [event(67)])),
      timing: rhythm([1, 0, 1]),
    };
    expectSchema(compileSynthEventState(state), {
      timing: {
        cycle: [
          [hit(0, 1 / 3), hit(2 / 3, 1 / 3)],
          [],
          [hit(0, 1 / 3), hit(2 / 3, 1 / 3)],
        ],
      },
      notes: { type: "static", cycle: [[[60], [60]], [null], [[67], [67]]] },
    });
  });

  it("filters active candidate ordinals rather than raw sparse rhythm positions", () => {
    const state = {
      ...synthState(authored([event(60), rest, event(64)])),
      timing: rhythm([1, 0, 1, 0, 1, 0, 1, 0]),
    };
    expectSchema(compileSynthEventState(state), {
      timing: { cycle: [[hit(0, 0.125), hit(0.5, 0.125), hit(0.75, 0.125)]] },
      notes: { type: "static", cycle: [[[60], [64], [60]]] },
    });
  });

  it("derives gates from continuations when notes own timing", () => {
    const state = synthState(
      authored([event(60), continuation, continuation, event(64), rest]),
    );
    expectSchema(compileSynthEventState(state), {
      timing: { cycle: [[hit(0, 3 / 5), hit(3 * (1 / 5), 1 / 5)]] },
      notes: { type: "static", cycle: [[[60], [64]]] },
    });
  });

  it("continuations occupy external ordinals transparently and never produce values", () => {
    const state = {
      ...synthState(authored([event(60), continuation, rest, event(67)])),
      timing: rhythm([1, 1, 1, 1]),
    };
    expectSchema(compileSynthEventState(state), {
      timing: { cycle: [[hit(0, 0.25), hit(0.25, 0.25), hit(0.75, 0.25)]] },
      notes: { type: "static", cycle: [[[60], [67], [60]]] },
    });
  });

  it("explicit timing retains its gates rather than inheriting note weights", () => {
    const state = {
      ...synthState(
        authored([event(60), continuation, event(67), continuation]),
      ),
      timing: {
        intent: "explicit",
        cycle: makeCycle<1>([
          [onset, continuation, rest, onset, continuation, rest],
        ]),
      } as const,
    };
    expectSchema(compileSynthEventState(state), {
      timing: { cycle: [[hit(0, 1 / 3), hit(0.5, 1 / 3)]] },
      notes: { type: "static", cycle: [[[60], [67]]] },
    });
  });

  it("transformed defaults fill external hits but never activate silent timing", () => {
    const source = {
      ...fallback(60, 64),
      cycle: makeCycle([[event(60, 64)], [rest]]),
    };
    const state = { ...synthState(source), timing: rhythm([0, 0], [1, 1]) };
    expectSchema(compileSynthEventState(state), {
      timing: { cycle: [[], [hit(0, 0.5), hit(0.5, 0.5)]] },
      notes: {
        type: "static",
        cycle: [
          [null],
          [
            [60, 64],
            [60, 64],
          ],
        ],
      },
    });
    expectSchema(compileSynthEventState(synthState(source)), {
      timing: { cycle: [[hit(0, 1)], []] },
      notes: { type: "static", cycle: [[[60, 64]], [null]] },
    });
  });

  it("applies root and negative scale degrees without changing geometry", () => {
    const state = {
      ...synthState(authored([event(0), event(-1), event(2), event(-8)])),
      pitch: {
        root: 60,
        scale: [0, 2, 4, 5, 7, 9, 11],
        hasRequestedTransform: true,
      },
    };
    expectSchema(compileSynthEventState(state), {
      timing: {
        cycle: [
          [hit(0, 0.25), hit(0.25, 0.25), hit(0.5, 0.25), hit(0.75, 0.25)],
        ],
      },
      notes: { type: "static", cycle: [[[60], [59], [64], [47]]] },
    });
    expect(
      compileSynthEventState({
        ...synthState(authored([event(-1.5, 2.25)])),
        pitch: { root: 57, hasRequestedTransform: true },
      }).notes,
    ).toEqual({ type: "static", cycle: [[[55.5, 59.25]]] });
  });
});

describe("native static sampler compilation", () => {
  it("omits unrequested notes and default variation without dropping default names", () => {
    expectSchema(compileSamplerEventState(samplerState()), {
      timing: { cycle: [[hit(0, 1)]] },
      sampleNames: { type: "static", cycle: [[["bd"]]] },
    });
    expect(
      compileSamplerEventState(
        samplerState({ pitch: { root: 0, hasRequestedTransform: true } }),
      ).notes,
    ).toEqual({ type: "static", cycle: [[[0]]] });
    expect(
      compileSamplerEventState(
        samplerState({ variation: authored([event(0)]) }),
      ).variationIndices,
    ).toEqual({ type: "static", cycle: [[[0]]] });
  });

  it("matches the sampler names, notes, and variations golden", () => {
    const state = samplerState({
      notes: authored([event(60), event(64)]),
      sampleNames: authored([event("bd"), event("sd")]),
      variation: authored([event(0), event(2)]),
    });
    expectSchema(compileSamplerEventState(state), {
      timing: { cycle: [[hit(0, 0.5), hit(0.5, 0.5)]] },
      notes: { type: "static", cycle: [[[60], [64]]] },
      sampleNames: { type: "static", cycle: [[["bd"], ["sd"]]] },
      variationIndices: { type: "static", cycle: [[[0], [2]]] },
    });
  });

  it("notes with authored rests beat denser lanes without filtering their timing twice", () => {
    const state = samplerState({
      notes: authored([event(60), rest, event(64)]),
      sampleNames: authored([
        event("bd"),
        event("hh"),
        event("sd"),
        event("cp"),
      ]),
      variation: authored([event(0), event(1), event(2), event(3)]),
    });
    expectSchema(compileSamplerEventState(state), {
      timing: { cycle: [[hit(0, 1 / 3), hit(2 / 3, 1 / 3)]] },
      notes: { type: "static", cycle: [[[60], [64]]] },
      sampleNames: {
        type: "static",
        cycle: [[["bd"], ["hh"], ["sd"], ["cp"]]],
      },
      variationIndices: { type: "static", cycle: [[[0], [1], [2], [3]]] },
    });
  });

  it("variation rests have priority over denser note and name lanes", () => {
    const state = samplerState({
      notes: authored([event(60), event(64), event(67)]),
      sampleNames: authored([
        event("bd"),
        event("hh"),
        event("sd"),
        event("cp"),
      ]),
      variation: authored([event(0), rest]),
    });
    expectSchema(compileSamplerEventState(state), {
      timing: { cycle: [[hit(0, 0.5)]] },
      notes: { type: "static", cycle: [[[60]]] },
      sampleNames: {
        type: "static",
        cycle: [[["bd"], ["hh"], ["sd"], ["cp"]]],
      },
      variationIndices: { type: "static", cycle: [[[0]]] },
    });
  });

  it("note-rest priority wins even when variation also has authored rests", () => {
    const state = samplerState({
      notes: authored([event(60), rest, event(64)]),
      variation: authored([event(0), event(1), event(2), rest]),
    });
    expectSchema(compileSamplerEventState(state), {
      timing: { cycle: [[hit(0, 1 / 3), hit(2 / 3, 1 / 3)]] },
      notes: { type: "static", cycle: [[[60], [64]]] },
      sampleNames: { type: "static", cycle: [[["bd"]]] },
      variationIndices: { type: "static", cycle: [[[0], [1], [2]]] },
    });
  });

  it("name rests do not claim priority over denser authored timing", () => {
    const state = samplerState({
      sampleNames: authored([event("bd"), rest]),
      variation: authored([event(0), event(1), event(2)]),
    });
    expectSchema(compileSamplerEventState(state), {
      timing: { cycle: [[hit(0, 1 / 3), hit(2 / 3, 1 / 3)]] },
      sampleNames: { type: "static", cycle: [[["bd"]]] },
      variationIndices: { type: "static", cycle: [[[0], [1], [2]]] },
    });
  });

  it("density compares average onsets across complete phrases, not step count", () => {
    const state = samplerState({
      notes: authored([event(60)], [event(64)]),
      variation: authored([event(0), event(1), event(2)]),
    });
    expectSchema(compileSamplerEventState(state), {
      timing: {
        cycle: [
          Array.from({ length: 3 }, (_, index) => hit(index / 3, 1 / 3)),
          Array.from({ length: 3 }, (_, index) => hit(index / 3, 1 / 3)),
        ],
      },
      notes: {
        type: "static",
        cycle: [
          [[60], [60], [60]],
          [[64], [64], [64]],
        ],
      },
      sampleNames: { type: "static", cycle: [[["bd"]], [["bd"]]] },
      variationIndices: {
        type: "static",
        cycle: [
          [[0], [1], [2]],
          [[0], [1], [2]],
        ],
      },
    });
  });

  it("density ties prefer notes, then names, then variation", () => {
    const nameLane = authored([rest, event("sd")]);
    const variation = authored([event(0), continuation]);
    const withNotes = samplerState({
      notes: authored([event(60), continuation]),
      sampleNames: nameLane,
      variation,
    });
    // Selected notes onset is removed by the non-owning name rest at ordinal 0.
    expectSchema(compileSamplerEventState(withNotes), {
      timing: { cycle: [[]] },
      notes: { type: "static", cycle: [[null]] },
      sampleNames: { type: "static", cycle: [[["sd"]]] },
      variationIndices: { type: "static", cycle: [[[0]]] },
    });
    expectSchema(
      compileSamplerEventState(
        samplerState({ sampleNames: nameLane, variation }),
      ),
      {
        timing: { cycle: [[hit(0.5, 0.5)]] },
        sampleNames: { type: "static", cycle: [[["sd"]]] },
        variationIndices: { type: "static", cycle: [[[0]]] },
      },
    );
  });

  it("defaults do not compete with authored timing even when their cycles are denser", () => {
    const state = samplerState({
      notes: {
        ...fallback(0),
        cycle: makeCycle([[event(0), event(0), event(0), event(0)]]),
      },
      sampleNames: {
        ...fallback("bd"),
        cycle: makeCycle([[event("bd"), event("bd"), event("bd")]]),
      },
      variation: authored([rest, event(2)]),
    });
    expectSchema(compileSamplerEventState(state), {
      timing: { cycle: [[hit(0.5, 0.5)]] },
      sampleNames: { type: "static", cycle: [[["bd"]]] },
      variationIndices: { type: "static", cycle: [[[2]]] },
    });
  });

  it("all authored lanes intersect on original candidate ordinals, not surviving ordinals", () => {
    const state = samplerState({
      notes: authored([event(60), rest]),
      sampleNames: authored([event("bd"), rest, event("sd")]),
      variation: authored([event(0), rest, event(2), event(3)]),
      timing: rhythm([1, 1, 1, 1]),
    });
    expectSchema(compileSamplerEventState(state), {
      timing: { cycle: [[hit(0, 0.25), hit(0.5, 0.25)]] },
      notes: { type: "static", cycle: [[[60], [60]]] },
      sampleNames: { type: "static", cycle: [[["bd"], ["sd"]]] },
      variationIndices: { type: "static", cycle: [[[0], [2], [3]]] },
    });
  });

  it("external continuations count as available slots in every value lane", () => {
    const state = samplerState({
      notes: authored([event(60), continuation, rest, event(67)]),
      sampleNames: authored([event("bd"), continuation, rest, event("sd")]),
      variation: authored([event(0), continuation, rest, event(2)]),
      timing: rhythm([1, 1, 1, 1]),
    });
    expectSchema(compileSamplerEventState(state), {
      timing: { cycle: [[hit(0, 0.25), hit(0.25, 0.25), hit(0.75, 0.25)]] },
      notes: { type: "static", cycle: [[[60], [67], [60]]] },
      sampleNames: { type: "static", cycle: [[["bd"], ["sd"]]] },
      variationIndices: { type: "static", cycle: [[[0], [2]]] },
    });
  });

  it("keeps polyphonic groups and compact independent wrapping", () => {
    const state = samplerState({
      notes: authored([event(60, 60), event(64, 67)]),
      sampleNames: authored([event("bd", "hh", "bd")]),
      variation: authored([event(0), event(1), event(2)]),
    });
    expectSchema(compileSamplerEventState(state), {
      timing: {
        cycle: [[hit(0, 1 / 3), hit(1 / 3, 1 / 3), hit(2 / 3, 1 / 3)]],
      },
      notes: {
        type: "static",
        cycle: [
          [
            [60, 60],
            [64, 67],
            [60, 60],
          ],
        ],
      },
      sampleNames: { type: "static", cycle: [[["bd", "hh", "bd"]]] },
      variationIndices: { type: "static", cycle: [[[0], [1], [2]]] },
    });
  });

  it("expands values and timing to their bounded common phrase length", () => {
    const state = samplerState({
      notes: authored([event(60)], [event(64), event(67)]),
      variation: authored([event(0)], [event(1)], [event(2)]),
    });
    expectSchema(compileSamplerEventState(state), {
      timing: {
        cycle: [
          [hit(0, 1)],
          [hit(0, 0.5), hit(0.5, 0.5)],
          [hit(0, 1)],
          [hit(0, 0.5), hit(0.5, 0.5)],
          [hit(0, 1)],
          [hit(0, 0.5), hit(0.5, 0.5)],
        ],
      },
      notes: {
        type: "static",
        cycle: [
          [[60]],
          [[64], [67]],
          [[60]],
          [[64], [67]],
          [[60]],
          [[64], [67]],
        ],
      },
      sampleNames: {
        type: "static",
        cycle: Array.from({ length: 6 }, () => [["bd"]]),
      },
      variationIndices: {
        type: "static",
        cycle: [[[0]], [[1]], [[2]], [[0]], [[1]], [[2]]],
      },
    });
  });

  it("default fallback groups fill hits in transformed silent value bars, but not silent timing bars", () => {
    const state = samplerState({
      notes: { ...fallback(0, 4), cycle: makeCycle([[event(0, 4)], [rest]]) },
      sampleNames: {
        ...fallback("bd", "hh"),
        cycle: makeCycle([[event("bd", "hh")], [rest]]),
      },
      variation: {
        ...fallback(2, 3),
        cycle: makeCycle([[event(2, 3)], [rest]]),
      },
      pitch: { root: 57, hasRequestedTransform: true },
      timing: rhythm([1, 1], [0, 0]),
    });
    expectSchema(compileSamplerEventState(state), {
      timing: { cycle: [[hit(0, 0.5), hit(0.5, 0.5)], []] },
      notes: {
        type: "static",
        cycle: [
          [
            [57, 61],
            [57, 61],
          ],
          [null],
        ],
      },
      sampleNames: { type: "static", cycle: [[["bd", "hh"]], [["bd", "hh"]]] },
      variationIndices: { type: "static", cycle: [[[2, 3]], [[2, 3]]] },
    });
  });

  it("empty note bars do not claim rest priority, but still suppress their final bar", () => {
    const state = samplerState({
      notes: {
        ...authored([rest], [event(60)]),
        zeroWidthPatterns: [true, false],
      },
      variation: authored([event(0), event(1)]),
    });
    expectSchema(compileSamplerEventState(state), {
      timing: { cycle: [[], [hit(0, 0.5), hit(0.5, 0.5)]] },
      notes: { type: "static", cycle: [[null], [[60], [60]]] },
      sampleNames: { type: "static", cycle: [[["bd"]], [["bd"]]] },
      variationIndices: {
        type: "static",
        cycle: [
          [[0], [1]],
          [[0], [1]],
        ],
      },
    });
  });

  it("shared materialized timing avoids applying the same rest intersection twice", () => {
    const identity = Symbol("shared timing");
    const availability = {
      intent: "authored",
      cycle: makeCycle([[event(true), event(false), event(true)]]),
    } as const;
    const state = samplerState({
      notes: {
        ...authored([event(60), rest, event(64)]),
        availability,
        materializedTiming: identity,
      },
      variation: {
        ...authored([event(0), rest, event(2)]),
        availability,
        materializedTiming: identity,
      },
    });
    expectSchema(compileSamplerEventState(state), {
      timing: { cycle: [[hit(0, 1 / 3), hit(2 / 3, 1 / 3)]] },
      notes: { type: "static", cycle: [[[60], [64]]] },
      sampleNames: { type: "static", cycle: [[["bd"]]] },
      variationIndices: { type: "static", cycle: [[[0], [2]]] },
    });
    const independent = samplerState({
      ...state,
      variation: { ...authored([event(0), rest, event(2)]), availability },
    });
    expect(compileSamplerEventState(independent).timing.cycle).toEqual([
      [hit(0, 1 / 3)],
    ]);
  });

  it("materialized timing gaps stay transparent while authored false slots still filter", () => {
    const source = authored([event(64), rest, event(60)]);
    const gaps = {
      intent: "authored",
      cycle: makeCycle([
        [
          event<boolean | "timing-gap">(true),
          event<boolean | "timing-gap">("timing-gap"),
          event<boolean | "timing-gap">(true),
        ],
      ]),
    } as const;
    const state = samplerState({
      notes: { ...source, availability: gaps },
      timing: rhythm([1, 1, 1, 1]),
    });
    expectSchema(compileSamplerEventState(state), {
      timing: {
        cycle: [
          [hit(0, 0.25), hit(0.25, 0.25), hit(0.5, 0.25), hit(0.75, 0.25)],
        ],
      },
      notes: { type: "static", cycle: [[[64], [60], [64], [60]]] },
      sampleNames: { type: "static", cycle: [[["bd"]]] },
    });
    const authoredRests = samplerState({
      ...state,
      notes: {
        ...source,
        availability: {
          intent: "authored",
          cycle: makeCycle([[event(true), event(false), event(true)]]),
        },
      },
    });
    expectSchema(compileSamplerEventState(authoredRests), {
      timing: { cycle: [[hit(0, 0.25), hit(0.5, 0.25), hit(0.75, 0.25)]] },
      notes: { type: "static", cycle: [[[64], [60], [64]]] },
      sampleNames: { type: "static", cycle: [[["bd"]]] },
    });
  });

  it("transformed default notes supply fallback timing when no authored lane exists", () => {
    const state = samplerState({
      notes: { ...fallback(0), cycle: makeCycle([[event(0)], [rest]]) },
    });
    expectSchema(compileSamplerEventState(state), {
      timing: { cycle: [[hit(0, 1)], []] },
      sampleNames: { type: "static", cycle: [[["bd"]], [["bd"]]] },
    });
  });

  it("requires at least one name but permits explicit silent name bars", () => {
    expect(() =>
      compileSamplerEventState(samplerState({ sampleNames: undefined })),
    ).toThrow("sample name is required");
    expect(() =>
      compileSamplerEventState(
        samplerState({ sampleNames: authored([rest], [rest]) }),
      ),
    ).toThrow("must contain at least one sample name");
    expectSchema(
      compileSamplerEventState(
        samplerState({
          sampleNames: authored([rest], [event("sd")]),
          timing: rhythm([1]),
        }),
      ),
      {
        timing: { cycle: [[], [hit(0, 1)]] },
        sampleNames: { type: "static", cycle: [[null], [["sd"]]] },
      },
    );
  });
});

describe("compilation purity and limits", () => {
  it("accepts frozen state and never aliases caller data or repeated output groups", () => {
    const mutable = samplerState({
      notes: authored([event(60, 64)]),
      sampleNames: authored([event("bd")], [event("sd")]),
      variation: authored([event(0), event(1)]),
      timing: rhythm([1, 1, 1, 1]),
    });
    const before = structuredClone(mutable);
    const first = compileSamplerEventState(mutable);
    expect(mutable).toEqual(before);
    expect(Object.isFrozen(mutable)).toBe(false);
    const frozen = Object.freeze(mutable);
    const second = compileSamplerEventState(frozen);
    expect(second).toEqual(first);
    if (first.notes?.type !== "static")
      throw new Error("Expected static notes");
    first.notes.cycle[0][0]?.push(99);
    first.sampleNames.cycle[0][0]?.push("other");
    first.timing.cycle[0][0].offset = 0.75;
    expect(first.notes.cycle[0][1]).toEqual([60, 64]);
    expect(first.sampleNames.cycle[1][0]).toEqual(["sd"]);
    expect(compileSamplerEventState(frozen)).toEqual(second);
    expect(mutable).toEqual(before);
  });

  it("compiler reads cannot change later immediate speed transforms", () => {
    const initial = synthState(authored([event(60)]));
    const fast = transformEventState(initial, { type: "fast", multiplier: 2 });
    const uninterrupted = transformEventState(fast, {
      type: "slow",
      multiplier: 2,
    });
    compileSynthEventState(fast);
    compileSynthEventState(fast);
    const observed = transformEventState(fast, { type: "slow", multiplier: 2 });
    expect(compileSynthEventState(observed)).toEqual(
      compileSynthEventState(uninterrupted),
    );
    expectSchema(compileSynthEventState(observed), {
      timing: { cycle: [[hit(0, 0.5)], [hit(0, 0.5)]] },
      notes: { type: "static", cycle: [[[60]], [[60]]] },
    });
    const replaced = replaceEventTiming(observed, rhythm([1]).cycle);
    expectSchema(compileSynthEventState(replaced), {
      timing: { cycle: [[hit(0, 1)], [hit(0, 1)]] },
      notes: { type: "static", cycle: [[[60]], [[60]]] },
    });
  });

  it("sampler compilation reads cannot change later transforms", () => {
    const initial = samplerState({
      notes: authored([event(60), event(64)]),
      variation: authored([event(0), event(1)]),
    });
    const fast = transformEventState(initial, { type: "fast", multiplier: 2 });
    const uninterrupted = transformEventState(fast, {
      type: "slow",
      multiplier: 2,
    });
    compileSamplerEventState(fast);
    compileSamplerEventState(fast);
    const observed = transformEventState(fast, { type: "slow", multiplier: 2 });
    expect(compileSamplerEventState(observed)).toEqual(
      compileSamplerEventState(uninterrupted),
    );
    expectSchema(compileSamplerEventState(observed), {
      timing: {
        cycle: [
          [hit(0, 0.25), hit(0.5, 0.25)],
          [hit(0, 0.25), hit(0.5, 0.25)],
        ],
      },
      notes: {
        type: "static",
        cycle: [
          [[60], [64]],
          [[60], [64]],
        ],
      },
      sampleNames: { type: "static", cycle: [[["bd"]], [["bd"]]] },
      variationIndices: {
        type: "static",
        cycle: [
          [[0], [1]],
          [[0], [1]],
        ],
      },
    });
  });

  it("checks LCM bar limits before expanding the phrase", () => {
    const state = samplerState({
      notes: authored(...Array.from({ length: 32 }, () => [event(60)])),
      variation: authored(...Array.from({ length: 33 }, () => [event(0)])),
    });
    expect(() => compileSamplerEventState(state)).toThrow("1024 bars");
  });

  it("bounds expanded static value patterns even when timing is silent", () => {
    const state = samplerState({
      sampleNames: authored(Array.from({ length: 1024 }, () => event("bd"))),
      timing: rhythm(...Array.from({ length: 17 }, () => [0])),
    });
    expect(() => compileSamplerEventState(state)).toThrow(
      "Compiled sample names contains more than 16384 events",
    );
  });

  it("bounds expanded note voices before allocating wrapped chords", () => {
    const voices: NonEmptyGroup<number> = [60, ...Array<number>(127).fill(64)];
    const source = authored([event(...voices)]);
    const accepted = {
      ...synthState(source),
      timing: rhythm(Array<number>(512).fill(1)),
    };
    expect(staticNotes(compileSynthEventState(accepted)).cycle[0]).toHaveLength(
      512,
    );
    expect(() =>
      compileSynthEventState({
        ...synthState(source),
        timing: rhythm(Array<number>(513).fill(1)),
      }),
    ).toThrow("Compiled notes contains more than 65536 voices");
  });

  it("bounds repeated sample and variation voice groups", () => {
    const names: NonEmptyGroup<string> = [
      "bd",
      ...Array<string>(127).fill("hh"),
    ];
    const timing = rhythm(...Array.from({ length: 513 }, () => [0]));
    expect(() =>
      compileSamplerEventState(
        samplerState({ sampleNames: authored([event(...names)]), timing }),
      ),
    ).toThrow("Compiled sample names contains more than 65536 voices");
    const voices: NonEmptyGroup<number> = [0, ...Array<number>(127).fill(1)];
    expect(() =>
      compileSamplerEventState(
        samplerState({ variation: authored([event(...voices)]), timing }),
      ),
    ).toThrow("Compiled variations contains more than 65536 voices");
  });

  it("accepts the exact event boundary and rejects expanded grids beyond it", () => {
    const state = {
      ...synthState(authored([event(60)])),
      timing: rhythm(Array<number>(MAX_EVENT_CYCLE_STEPS).fill(1)),
    };
    expect(compileSynthEventState(state).timing.cycle[0]).toHaveLength(
      MAX_EVENT_CYCLE_STEPS,
    );
    const repeated = {
      ...synthState(authored([event(60)], [event(64)])),
      timing: rhythm(Array<number>(8193).fill(1)),
    };
    expect(() => compileSynthEventState(repeated)).toThrow("16384 steps");
  });

  it("derives numeric offsets at the schema boundary without modifying exact cycle geometry", () => {
    const notes = authored([
      event(0),
      event(1),
      event(2),
      event(3),
      event(4),
      event(5),
    ]);
    const before = getEventPatternGeometry(notes.cycle.patterns[0]);
    const schema = compileSynthEventState(synthState(notes));
    expect(schema.timing.cycle[0][5]).toEqual(hit(5 * (1 / 6), 1 / 6));
    expect(getEventPatternGeometry(notes.cycle.patterns[0])).toEqual(before);
  });
});

describe("native random value compilation", () => {
  it("matches the corrected random synth values under fixed timing golden", () => {
    const state = {
      ...synthState(randomLane({}, [onset, onset])),
      timing: rhythm([1, 1, 1, 1]),
    };
    expectSchema(compileSynthEventState(state), {
      timing: {
        cycle: [
          [hit(0, 0.25), hit(0.25, 0.25), hit(0.5, 0.25), hit(0.75, 0.25)],
        ],
      },
      notes: {
        type: "random-number",
        valuesPerBar: [4],
        dataType: "integer",
        segments: [{ seed: 9 }],
        range: { min: 48, max: 72 },
        algorithm: "xor",
        order: "forward",
      },
    });
  });

  it("matches the corrected random variation settings and zero-count golden", () => {
    const state = samplerState({
      variation: randomLane(
        { segments: [{ seed: 11 }], range: { min: 0, max: 4 } },
        [onset, onset],
        [rest],
      ),
    });
    expectSchema(compileSamplerEventState(state), {
      timing: { cycle: [[hit(0, 0.5), hit(0.5, 0.5)], []] },
      sampleNames: { type: "static", cycle: [[["bd"]], [["bd"]]] },
      variationIndices: {
        type: "random-number",
        valuesPerBar: [2, 0],
        dataType: "integer",
        segments: [{ seed: 11 }],
        range: { min: 0, max: 4 },
        algorithm: "xor",
        order: "forward",
      },
    });
  });

  it("derives implicit random note counts and gates from onsets, not raw steps", () => {
    const state = synthState(
      randomLane({}, [onset, rest, onset, continuation], [rest], [onset]),
    );
    expectSchema(compileSynthEventState(state), {
      timing: { cycle: [[hit(0, 0.25), hit(0.5, 0.5)], [], [hit(0, 1)]] },
      notes: {
        type: "random-number",
        valuesPerBar: [2, 0, 1],
        dataType: "integer",
        segments: [{ seed: 9 }],
        range: { min: 48, max: 72 },
        algorithm: "xor",
        order: "forward",
      },
    });
  });

  it("explicit synth timing replaces random counts even for originally empty bars", () => {
    const source = randomLane({}, [onset], [rest]);
    const state = { ...synthState(source), timing: rhythm([1, 0, 1, 1]) };
    expectSchema(compileSynthEventState(state), {
      timing: {
        cycle: [
          [hit(0, 0.25), hit(0.5, 0.25), hit(0.75, 0.25)],
          [hit(0, 0.25), hit(0.5, 0.25), hit(0.75, 0.25)],
        ],
      },
      notes: {
        type: "random-number",
        valuesPerBar: [3, 3],
        dataType: "integer",
        segments: [{ seed: 9 }],
        range: { min: 48, max: 72 },
        algorithm: "xor",
        order: "forward",
      },
    });
    const sampler = compileSamplerEventState(
      samplerState({ notes: source, timing: state.timing }),
    );
    expect(sampler.timing.cycle).toEqual([
      [hit(0, 0.25), hit(0.5, 0.25), hit(0.75, 0.25)],
      [],
    ]);
    expect(sampler.notes).toMatchObject({
      type: "random-number",
      valuesPerBar: [3, 0],
    });
  });

  it("random sparse gaps do not claim fixed-rest priority or filter external ordinals", () => {
    const source = randomLane({}, [onset, rest, rest, rest]);
    const state = samplerState({
      notes: source,
      variation: authored([event(0), event(1)]),
    });
    expectSchema(compileSamplerEventState(state), {
      timing: { cycle: [[hit(0, 0.5), hit(0.5, 0.5)]] },
      sampleNames: { type: "static", cycle: [[["bd"]]] },
      notes: {
        type: "random-number",
        valuesPerBar: [2],
        dataType: "integer",
        segments: [{ seed: 9 }],
        range: { min: 48, max: 72 },
        algorithm: "xor",
        order: "forward",
      },
      variationIndices: { type: "static", cycle: [[[0], [1]]] },
    });
  });

  it("authored static rests retain priority over denser random timing", () => {
    const state = samplerState({
      notes: randomLane({}, [onset, onset, onset, onset]),
      variation: authored([event(0), rest]),
    });
    expectSchema(compileSamplerEventState(state), {
      timing: { cycle: [[hit(0, 0.5)]] },
      sampleNames: { type: "static", cycle: [[["bd"]]] },
      notes: {
        type: "random-number",
        valuesPerBar: [1],
        dataType: "integer",
        segments: [{ seed: 9 }],
        range: { min: 48, max: 72 },
        algorithm: "xor",
        order: "forward",
      },
      variationIndices: { type: "static", cycle: [[[0]]] },
    });
  });

  it("random notes use final candidate counts while variations wrap their original counts", () => {
    const state = samplerState({
      notes: randomLane({}, [onset]),
      variation: randomLane({ range: { min: 0, max: 4 } }, [onset, onset]),
      sampleNames: authored([event("bd"), rest, event("sd")]),
      timing: rhythm([1, 1, 1, 1]),
    });
    expectSchema(compileSamplerEventState(state), {
      timing: { cycle: [[hit(0, 0.25), hit(0.5, 0.25), hit(0.75, 0.25)]] },
      sampleNames: { type: "static", cycle: [[["bd"], ["sd"]]] },
      notes: {
        type: "random-number",
        valuesPerBar: [3],
        dataType: "integer",
        segments: [{ seed: 9 }],
        range: { min: 48, max: 72 },
        algorithm: "xor",
        order: "forward",
      },
      variationIndices: {
        type: "random-number",
        valuesPerBar: [2],
        dataType: "integer",
        segments: [{ seed: 9 }],
        range: { min: 0, max: 4 },
        algorithm: "xor",
        order: "forward",
      },
    });
  });

  it("intersects random zero-count bars over the full common phrase", () => {
    const state = samplerState({
      notes: randomLane({}, [onset, onset], [rest]),
      variation: randomLane(
        { range: { min: 0, max: 4 } },
        [onset],
        [onset, onset],
        [rest],
      ),
      timing: rhythm([1, 1]),
    });
    expectSchema(compileSamplerEventState(state), {
      timing: {
        cycle: [
          [hit(0, 0.5), hit(0.5, 0.5)],
          [],
          [],
          [],
          [hit(0, 0.5), hit(0.5, 0.5)],
          [],
        ],
      },
      sampleNames: {
        type: "static",
        cycle: Array.from({ length: 6 }, () => [["bd"]]),
      },
      notes: {
        type: "random-number",
        valuesPerBar: [2, 0, 0, 0, 2, 0],
        dataType: "integer",
        segments: [{ seed: 9 }],
        range: { min: 48, max: 72 },
        algorithm: "xor",
        order: "forward",
      },
      variationIndices: {
        type: "random-number",
        valuesPerBar: [1, 2, 0, 1, 2, 0],
        dataType: "integer",
        segments: [{ seed: 9 }],
        range: { min: 0, max: 4 },
        algorithm: "xor",
        order: "forward",
      },
    });
  });

  it("preserves float, quantization, mapped values, ribbon segments, algorithm, and reverse order", () => {
    const settings = {
      dataType: "float",
      segments: [
        { seed: 7, len: 2 },
        { seed: 11, len: 3 },
      ],
      range: { min: -2, max: 5 },
      quantValue: 0.25,
      valueMap: [-1.5, 0, 2.25],
      algorithm: "mulberry",
      order: "reverse",
    } as const;
    const source = randomLane(settings, [onset, onset]);
    const state = samplerState({ notes: source, variation: source });
    expectSchema(compileSamplerEventState(state), {
      timing: { cycle: [[hit(0, 0.5), hit(0.5, 0.5)]] },
      sampleNames: { type: "static", cycle: [[["bd"]]] },
      notes: {
        ...settings,
        type: "random-number",
        segments: [
          { seed: 7, len: 2 },
          { seed: 11, len: 3 },
        ],
        valueMap: [-1.5, 0, 2.25],
        valuesPerBar: [2],
      },
      variationIndices: {
        ...settings,
        type: "random-number",
        segments: [
          { seed: 7, len: 2 },
          { seed: 11, len: 3 },
        ],
        valueMap: [-1.5, 0, 2.25],
        valuesPerBar: [2],
      },
    });
  });

  it("binary notes map root/scale degrees while binary variations retain generation settings", () => {
    const source = randomLane(
      { dataType: "binary", range: undefined, valueMap: [3, 5] },
      [onset],
    );
    const state = samplerState({
      notes: source,
      variation: source,
      pitch: {
        root: 60,
        scale: [0, 2, 4, 5, 7, 9, 11],
        hasRequestedTransform: true,
      },
    });
    expectSchema(compileSamplerEventState(state), {
      timing: { cycle: [[hit(0, 1)]] },
      sampleNames: { type: "static", cycle: [[["bd"]]] },
      notes: {
        type: "random-number",
        valuesPerBar: [1],
        dataType: "binary",
        segments: [{ seed: 9 }],
        valueMap: [60, 62],
        algorithm: "xor",
        order: "forward",
      },
      variationIndices: {
        type: "random-number",
        valuesPerBar: [1],
        dataType: "binary",
        segments: [{ seed: 9 }],
        valueMap: [3, 5],
        algorithm: "xor",
        order: "forward",
      },
    });
  });

  it("maps numeric random notes across bounded negative and fractional range endpoints", () => {
    const source = randomLane({ range: { min: -1.2, max: 2.2 } }, [onset]);
    const state = {
      ...synthState(source),
      pitch: {
        root: 60,
        scale: [0, 2, 4, 5, 7, 9, 11],
        hasRequestedTransform: true,
      },
    };
    expectSchema(compileSynthEventState(state), {
      timing: { cycle: [[hit(0, 1)]] },
      notes: {
        type: "random-number",
        valuesPerBar: [1],
        dataType: "integer",
        segments: [{ seed: 9 }],
        valueMap: [57, 59, 60, 62, 64],
        algorithm: "xor",
        order: "forward",
      },
    });
    const defaultRange = {
      ...state,
      notes: randomLane({ range: undefined }, [onset]),
    };
    expect(compileSynthEventState(defaultRange).notes).toMatchObject({
      valueMap: [60, 62, 64, 65, 67, 69, 71],
      range: undefined,
    });
  });

  it("retains established nonbinary range/map semantics without a scale", () => {
    const source = randomLane({ valueMap: [48, 72] }, [onset]);
    const state = {
      ...synthState(source),
      pitch: { root: 60, hasRequestedTransform: true },
    };
    expect(compileSynthEventState(state).notes).toMatchObject({
      range: { min: 48, max: 72 },
      valueMap: [48, 72],
    });
  });

  it("bounds generated scale maps before allocation, including unsafe degree endpoints", () => {
    const pitch = { root: 0, scale: [0], hasRequestedTransform: true };
    const state = {
      ...synthState(
        randomLane(
          { range: { min: 0, max: MAX_RANDOM_EVENT_SETTINGS_ITEMS } },
          [onset],
        ),
      ),
      pitch,
    };
    const accepted = compileSynthEventState(state).notes;
    if (accepted.type !== "random-number")
      throw new Error("Expected random notes");
    expect(accepted.valueMap).toHaveLength(MAX_RANDOM_EVENT_SETTINGS_ITEMS);
    for (const range of [
      { min: 0, max: MAX_RANDOM_EVENT_SETTINGS_ITEMS + 1 },
      { min: Number.MAX_SAFE_INTEGER + 1, max: Number.MAX_SAFE_INTEGER + 2 },
      { min: 0, max: 0 },
    ])
      expect(() =>
        compileSynthEventState({
          ...state,
          notes: randomLane({ range }, [onset]),
        }),
      ).toThrow("Random note scale map requires");
  });

  it("bounds expanded random variation counts even when all timing is silent", () => {
    const state = samplerState({
      variation: randomLane(
        {},
        Array.from({ length: 1024 }, () => onset),
      ),
      timing: rhythm(...Array.from({ length: 17 }, () => [0])),
    });
    expect(() => compileSamplerEventState(state)).toThrow(
      "Compiled random variations contains more than 16384 events",
    );
  });
});

describe("native timing chance compilation", () => {
  it("matches the random synth timing condition and zero-count golden", () => {
    const condition = {
      ...chance,
      probability: 0.25,
      segments: [{ seed: 7, len: 8 }],
    };
    const state = {
      ...synthState(authored([event(60), event(64)])),
      timing: { ...rhythm([1, 1], [0]), condition },
    };
    expectSchema(compileSynthEventState(state), {
      timing: { cycle: [[hit(0, 0.5), hit(0.5, 0.5)], []], condition },
      notes: { type: "static", cycle: [[[60], [64]], [null]] },
    });
  });

  it("filters fixed availability before emitting one shared runtime condition", () => {
    const state = samplerState({
      notes: authored([event(60), rest]),
      sampleNames: authored([event("bd"), rest, event("sd")]),
      variation: authored([event(0), rest, event(2), event(3)]),
      timing: { ...rhythm([1, 1, 1, 1]), condition: chance },
    });
    expectSchema(compileSamplerEventState(state), {
      timing: { cycle: [[hit(0, 0.25), hit(0.5, 0.25)]], condition: chance },
      notes: { type: "static", cycle: [[[60], [60]]] },
      sampleNames: { type: "static", cycle: [[["bd"], ["sd"]]] },
      variationIndices: { type: "static", cycle: [[[0], [2], [3]]] },
    });
  });

  it.each([0, 1])(
    "normalizes probability %s without retaining a redundant runtime condition",
    (probability) => {
      const timing = {
        ...rhythm([1, 1], [0]),
        condition: { ...chance, probability },
      };
      const fixed = compileSynthEventState({ ...synthState(), timing });
      const random = compileSynthEventState({
        ...synthState(randomLane({}, [onset])),
        timing,
      });
      expect(fixed.timing).toEqual({
        cycle:
          probability === 0 ? [[], []] : [[hit(0, 0.5), hit(0.5, 0.5)], []],
        condition: undefined,
      });
      expect(fixed.notes).toEqual({
        type: "static",
        cycle: probability === 0 ? [[null], [null]] : [[[60], [60]], [null]],
      });
      expect(random.timing).toEqual(fixed.timing);
      expect(random.notes).toMatchObject({
        valuesPerBar: probability === 0 ? [0, 0] : [2, 0],
      });
    },
  );

  it("emits the fixed-survivor schema consumed by runtime chance without advancing any values", () => {
    const state = samplerState({
      notes: randomLane({ segments: [{ seed: 7 }] }, [onset]),
      variation: randomLane(
        { segments: [{ seed: 11 }], range: { min: 0, max: 10 } },
        [onset, onset, onset],
      ),
      sampleNames: authored([event("bd"), rest, event("sd")]),
      timing: { ...rhythm(Array<number>(12).fill(1)), condition: chance },
    });
    // resolve-sampler-events.test.ts verifies that the unchanged engine handles
    // middle chance misses by dense final (not candidate) value index.
    expectSchema(compileSamplerEventState(state), {
      timing: {
        cycle: [
          [0, 2, 3, 5, 6, 8, 9, 11].map((index) =>
            hit(index * (1 / 12), 1 / 12),
          ),
        ],
        condition: chance,
      },
      sampleNames: { type: "static", cycle: [[["bd"], ["sd"]]] },
      notes: {
        type: "random-number",
        valuesPerBar: [8],
        dataType: "integer",
        segments: [{ seed: 7 }],
        range: { min: 48, max: 72 },
        algorithm: "xor",
        order: "forward",
      },
      variationIndices: {
        type: "random-number",
        valuesPerBar: [3],
        dataType: "integer",
        segments: [{ seed: 11 }],
        range: { min: 0, max: 10 },
        algorithm: "xor",
        order: "forward",
      },
    });
  });

  it("leaves chance and numeric generation independent and addressed only by final hit index", () => {
    const source = randomLane({ segments: [{ seed: 7 }] }, [onset, onset]);
    const state = samplerState({
      notes: source,
      variation: source,
      sampleNames: authored([event("bd"), rest, event("sd")]),
      timing: { ...rhythm([1, 1, 1, 1]), condition: chance },
    });
    // Three fixed survivors remain potential hits. Chance is evaluated only by
    // the unchanged engine, which renumbers actual survivors before value lookup.
    const schema = compileSamplerEventState(state);
    expect(schema.timing).toEqual({
      cycle: [[hit(0, 0.25), hit(0.5, 0.25), hit(0.75, 0.25)]],
      condition: chance,
    });
    expect(schema.notes).toMatchObject({
      valuesPerBar: [3],
      segments: [{ seed: 7 }],
    });
    expect(schema.variationIndices).toMatchObject({
      valuesPerBar: [2],
      segments: [{ seed: 7 }],
    });
    expect(schema.sampleNames).toEqual({
      type: "static",
      cycle: [[["bd"], ["sd"]]],
    });
    const rng = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Compiler must not generate randomness");
    });
    try {
      expect(compileSamplerEventState(state)).toEqual(schema);
      expect(compileSamplerEventState(state)).toEqual(schema);
      expect(rng).not.toHaveBeenCalled();
    } finally {
      rng.mockRestore();
    }
  });

  it("retains chance through fixed rhythm composition and reverses generation orders once", () => {
    const initial = {
      ...synthState(randomLane({}, [onset, onset])),
      timing: { ...rhythm([1, 1]), condition: chance },
    };
    const composed = composeEventTiming(initial, rhythm([1, 0, 1]).cycle);
    expect(compileSynthEventState(composed).timing.condition).toEqual(chance);
    const reverse = transformEventState(composed, { type: "reverse" });
    const schema = compileSynthEventState(reverse);
    expect(schema.timing.condition?.order).toBe("reverse");
    expect(schema.notes).toMatchObject({ order: "reverse" });
    expect(
      compileSynthEventState(transformEventState(reverse, { type: "reverse" })),
    ).toEqual(compileSynthEventState(composed));
  });

  it("does not alias or freeze mutable random settings or chance metadata supplied by callers", () => {
    const source = randomLane({ valueMap: [48, 72] }, [onset, onset]);
    const condition = { ...chance, segments: [{ seed: 7, len: 8 }] };
    const state = samplerState({
      notes: source,
      variation: source,
      timing: { ...rhythm([1, 1]), condition },
    });
    const before = structuredClone(state);
    const first = compileSamplerEventState(state);
    const second = compileSamplerEventState(state);
    if (
      first.notes?.type !== "random-number" ||
      first.variationIndices?.type !== "random-number"
    )
      throw new Error("Expected random schemas");
    first.notes.valuesPerBar[0] = 9;
    first.notes.segments[0].seed = 99;
    if (first.notes.range) first.notes.range.min = 0;
    first.notes.valueMap?.push(99);
    first.variationIndices.segments[0].seed = 101;
    if (first.timing.condition) first.timing.condition.segments[0].seed = 33;
    expect(state).toEqual(before);
    expect(Object.isFrozen(source.cycle.settings.valueMap)).toBe(false);
    expect(Object.isFrozen(condition.segments)).toBe(false);
    expect(compileSamplerEventState(state)).toEqual(second);
    expect(second.notes).toMatchObject({
      valuesPerBar: [2],
      segments: [{ seed: 9 }],
      valueMap: [48, 72],
    });
    expect(second.timing.condition).toEqual(condition);
  });
});

describe("native generated sampler timing compilation", () => {
  it("matches the generated chop/fit reverse exemption golden, including cross-bar gates", () => {
    const timingOverride = getChopTiming({ sliceCount: 2, sequence: null }, 4);
    const state = transformEventState(
      samplerState({ sampleNames: fallback("loop") }),
      { type: "reverse" },
      { timingOverride },
    );
    expectSchema(compileSamplerEventState(state, { timingOverride }), {
      timing: { cycle: [[hit(0, 2)], [], [hit(0, 2)], []] },
      sampleNames: {
        type: "static",
        cycle: Array.from({ length: 4 }, () => [["loop"]]),
      },
    });
  });

  it("matches the generated fit slowdown exemption golden", () => {
    const timingOverride = getDistributedTiming(2, 2);
    const state = transformEventState(
      samplerState({ sampleNames: fallback("loop") }),
      { type: "slow", multiplier: 2 },
      { timingOverride },
    );
    expectSchema(compileSamplerEventState(state, { timingOverride }), {
      timing: { cycle: [[hit(0, 1)], [hit(0, 1)]] },
      sampleNames: { type: "static", cycle: [[["loop"]], [["loop"]]] },
    });
  });

  it("generated timing supersedes explicit chance without replacing underlying authoring state", () => {
    const state = samplerState({
      notes: authored([event(60), event(64)]),
      timing: { ...rhythm([1, 0]), condition: { ...chance, probability: 0 } },
    });
    const timingOverride = { cycle: [[hit(0.125, 2), hit(0.75, 1.5)]] };
    const before = structuredClone(state);
    expectSchema(compileSamplerEventState(state, { timingOverride }), {
      timing: { cycle: [[hit(0.125, 2), hit(0.75, 1.5)]] },
      notes: { type: "static", cycle: [[[60], [64]]] },
      sampleNames: { type: "static", cycle: [[["bd"]]] },
    });
    expect(state).toEqual(before);
    expect(compileSamplerEventState(state).timing.cycle).toEqual([[]]);
    expect(compileSamplerEventState(state).notes).toEqual({
      type: "static",
      cycle: [[null]],
    });
  });

  it("applies all authored availability to original generated candidate ordinals", () => {
    const identity = Symbol("previous inferred timing");
    const notes = {
      ...authored([event(60), rest]),
      materializedTiming: identity,
    };
    const variation = {
      ...authored([event(0), rest, event(2), event(3)]),
      materializedTiming: identity,
    };
    const state = samplerState({
      notes,
      variation,
      sampleNames: authored([event("bd"), rest, event("sd")]),
    });
    const timingOverride = {
      cycle: [[hit(0, 2), hit(0.125, 2), hit(0.75, 2), hit(0.875, 2)]],
    };
    expectSchema(compileSamplerEventState(state, { timingOverride }), {
      timing: { cycle: [[hit(0, 2), hit(0.75, 2)]] },
      notes: { type: "static", cycle: [[[60], [60]]] },
      sampleNames: { type: "static", cycle: [[["bd"], ["sd"]]] },
      variationIndices: { type: "static", cycle: [[[0], [2], [3]]] },
    });
  });

  it("transparent continuations do not replace generated gate lengths", () => {
    const state = samplerState({
      notes: authored([event(60), continuation, rest, event(67)]),
    });
    const timingOverride = {
      cycle: [[hit(0, 2), hit(0.125, 3), hit(0.5, 2), hit(0.75, 4)]],
    };
    expectSchema(compileSamplerEventState(state, { timingOverride }), {
      timing: { cycle: [[hit(0, 2), hit(0.125, 3), hit(0.75, 4)]] },
      notes: { type: "static", cycle: [[[60], [67], [60]]] },
      sampleNames: { type: "static", cycle: [[["bd"]]] },
    });
  });

  it("defaults fill generated survivors despite transformed rest bars, but never activate empty bars", () => {
    const timingOverride = { cycle: [[], [hit(0.25, 2)]] };
    const initial = samplerState({
      pitch: { root: 57, hasRequestedTransform: true },
    });
    const state = transformEventState(
      initial,
      { type: "slow", multiplier: 2 },
      { timingOverride },
    );
    expectSchema(compileSamplerEventState(state, { timingOverride }), {
      timing: { cycle: [[], [hit(0.25, 2)]] },
      notes: { type: "static", cycle: [[null], [[57]]] },
      sampleNames: { type: "static", cycle: [[["bd"]], [["bd"]]] },
    });
  });

  it("filters random zero-count bars and expands generated timing over participating cycles", () => {
    const state = samplerState({
      notes: randomLane({}, [onset], [rest]),
      sampleNames: authored([event("bd")], [event("sd")], [event("hh")]),
    });
    const timingOverride = { cycle: [[hit(0.125, 2)]] };
    expectSchema(compileSamplerEventState(state, { timingOverride }), {
      timing: {
        cycle: [[hit(0.125, 2)], [], [hit(0.125, 2)], [], [hit(0.125, 2)], []],
      },
      notes: {
        type: "random-number",
        valuesPerBar: [1, 0, 1, 0, 1, 0],
        dataType: "integer",
        segments: [{ seed: 9 }],
        range: { min: 48, max: 72 },
        algorithm: "xor",
        order: "forward",
      },
      sampleNames: {
        type: "static",
        cycle: [[["bd"]], [["sd"]], [["hh"]], [["bd"]], [["sd"]], [["hh"]]],
      },
    });
  });

  it("random numeric settings and counts remain independent under a generated override", () => {
    const state = samplerState({
      notes: randomLane({}, [onset]),
      variation: randomLane({ range: { min: 0, max: 4 } }, [onset, onset]),
    });
    const timingOverride = { cycle: [[hit(0, 2), hit(0.25, 2), hit(0.75, 2)]] };
    const schema = compileSamplerEventState(state, { timingOverride });
    expect(schema.timing).toEqual({
      cycle: timingOverride.cycle,
      condition: undefined,
    });
    expect(schema.notes).toMatchObject({
      valuesPerBar: [3],
      range: { min: 48, max: 72 },
    });
    expect(schema.variationIndices).toMatchObject({
      valuesPerBar: [2],
      range: { min: 0, max: 4 },
    });
  });

  it("does not mutate, freeze, or alias generated timing or later transform behavior", () => {
    const timingOverride = { cycle: [[hit(0.125, 2)], []] };
    const state = samplerState();
    const before = structuredClone(timingOverride);
    const first = compileSamplerEventState(state, { timingOverride });
    const second = compileSamplerEventState(state, { timingOverride });
    first.timing.cycle[0][0].duration = 4;
    expect(timingOverride).toEqual(before);
    expect(Object.isFrozen(timingOverride.cycle)).toBe(false);
    expect(compileSamplerEventState(state, { timingOverride })).toEqual(second);
    const fast = transformEventState(
      state,
      { type: "fast", multiplier: 2 },
      { timingOverride },
    );
    const uninterrupted = transformEventState(
      fast,
      { type: "slow", multiplier: 2 },
      { timingOverride },
    );
    compileSamplerEventState(fast, { timingOverride });
    const observed = transformEventState(
      fast,
      { type: "slow", multiplier: 2 },
      { timingOverride },
    );
    expect(compileSamplerEventState(observed, { timingOverride })).toEqual(
      compileSamplerEventState(uninterrupted, { timingOverride }),
    );
    const frozen = Object.freeze({
      cycle: Object.freeze([
        Object.freeze([Object.freeze(hit(0.125, 2))]),
        Object.freeze([]),
      ]),
    });
    expect(compileSamplerEventState(state, { timingOverride: frozen })).toEqual(
      second,
    );
  });

  it.each([
    hit(Number.NaN, 1),
    hit(Infinity, 1),
    hit(-0.1, 1),
    hit(1, 1),
    hit(0, Number.NaN),
    hit(0, Infinity),
    hit(0, 0),
    hit(0, -1),
  ])("rejects malformed generated geometry %j", (step) => {
    expect(() =>
      compileSamplerEventState(samplerState(), {
        timingOverride: { cycle: [[step]] },
      }),
    ).toThrow("Generated timing requires finite offsets");
  });

  it.each([
    [hit(0.5, 1), hit(0.25, 1)],
    [hit(0.25, 1), hit(0.25, 1)],
  ])("rejects unordered or duplicate generated onsets %j", (...bar) => {
    expect(() =>
      compileSamplerEventState(samplerState(), {
        timingOverride: { cycle: [bar] },
      }),
    ).toThrow("Generated timing offsets must be strictly increasing");
  });

  it("bounds generated input bars and events before expansion", () => {
    expect(() =>
      compileSamplerEventState(samplerState(), {
        timingOverride: { cycle: [] },
      }),
    ).toThrow("at least one bar");
    expect(() =>
      compileSamplerEventState(samplerState(), {
        timingOverride: { cycle: Array.from({ length: 1025 }, () => []) },
      }),
    ).toThrow("1024 bars");
    expect(() =>
      compileSamplerEventState(samplerState(), {
        timingOverride: {
          cycle: [Array.from({ length: 16385 }, () => hit(0, 1))],
        },
      }),
    ).toThrow("Compiled generated timing contains more than 16384 events");
  });

  it("bounds generated LCM and final emitted event expansion", () => {
    const state = samplerState({
      notes: authored(...Array.from({ length: 32 }, () => [event(60)])),
    });
    expect(() =>
      compileSamplerEventState(state, {
        timingOverride: {
          cycle: Array.from({ length: 33 }, () => [hit(0, 1)]),
        },
      }),
    ).toThrow("1024 bars");
    const repeated = samplerState({
      notes: {
        ...fallback(0),
        cycle: makeCycle(Array.from({ length: 128 }, () => [event(0)])),
      },
      pitch: { root: 0, hasRequestedTransform: true },
    });
    expect(() =>
      compileSamplerEventState(repeated, {
        timingOverride: {
          cycle: [
            Array.from({ length: 129 }, (_, index) => hit(index / 129, 1)),
          ],
        },
      }),
    ).toThrow("Compiled timing contains more than 16384 events");
  });
});
