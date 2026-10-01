import { describe, expect, it } from "vitest";
import {
  getEventPatternGeometry,
  MAX_EVENT_CYCLE_STEPS,
  type EventPattern,
  type NonEmptyGroup,
} from "@web-audio/patterns";
import type { SamplerEventPattern, SynthEventPattern } from "@web-audio/schema";
import type {
  SamplerEventState,
  StaticEventSource,
  SynthEventState,
} from "./event-state";
import { makeCycle } from "./event-state-geometry";
import {
  compileSamplerEventState,
  compileSynthEventState,
} from "./event-state-compiler";
import {
  replaceEventTiming,
  transformEventState,
} from "./event-state-transitions";

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
function synthState(notes: StaticEventSource<number> = fallback(60)) {
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
    expect(compileSynthEventState(accepted).notes.cycle[0]).toHaveLength(512);
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

  it("rejects unsupported Step 4.4 branches instead of silently dropping them", () => {
    const random = {
      intent: "authored",
      cycle: {
        type: "random-event-cycle",
        candidateCycle: makeCycle<1>([[onset]]),
        settings: {
          dataType: "integer",
          segments: [{ seed: 7 }],
          algorithm: "xor",
          order: "forward",
        },
      },
    } as const;
    expect(() =>
      compileSynthEventState({ ...synthState(), notes: random }),
    ).toThrow("Random event compilation is not implemented yet");
    expect(() =>
      compileSamplerEventState(samplerState({ variation: random })),
    ).toThrow("Random event compilation is not implemented yet");
    const condition = {
      type: "chance",
      probability: 0.5,
      segments: [{ seed: 7 }],
      algorithm: "xor",
      order: "forward",
    } as const;
    expect(() =>
      compileSynthEventState({
        ...synthState(),
        timing: { ...rhythm([1]), condition },
      }),
    ).toThrow("Timing chance compilation is not implemented yet");
  });
});
