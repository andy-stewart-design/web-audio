import {
  evaluatePatternExpression,
  type EventCycle,
  type NonEmptyGroup,
  type PatternExpression,
  type RandomEventCycle,
  type StaticEventCycle,
} from "@web-audio/patterns";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { TimingChanceCondition } from "@/types";
import type {
  DefaultEventSource,
  EventSource,
  GeneratedTimingOverride,
  InstrumentEventState,
  PitchState,
  SamplerEventCompilerInput,
  SamplerEventState,
  StaticEventSource,
  SynthEventState,
  TimingState,
} from "@/events/state";

function staticCycle<T>(value: T) {
  return evaluatePatternExpression({
    type: "pattern-expression",
    patterns: [{ type: "atom", value }],
  });
}

const candidates = staticCycle<1>(1);
const pitch = Object.freeze({ root: 0, hasRequestedTransform: false });
const timing = Object.freeze({
  intent: "implicit",
  cycle: candidates,
} as const);
const notes = Object.freeze({
  intent: "default",
  fallback: Object.freeze([60] as const),
  cycle: staticCycle(60),
} as const satisfies DefaultEventSource<number>);
const variation = Object.freeze({
  intent: "default",
  fallback: Object.freeze([0] as const),
  cycle: staticCycle(0),
} as const satisfies DefaultEventSource<number>);
const random = Object.freeze({
  type: "random-event-cycle",
  candidateCycle: candidates,
  settings: Object.freeze({
    dataType: "integer",
    segments: Object.freeze([Object.freeze({ seed: 7, len: 4 })]),
    range: Object.freeze({ min: -2, max: 8 }),
    quantValue: 0.25,
    algorithm: "mulberry",
    order: "reverse",
    valueMap: Object.freeze([60, 64, 67]),
  }),
} as const satisfies RandomEventCycle);

function samplerState() {
  return Object.freeze({
    type: "sampler",
    notes: Object.freeze({
      intent: "default",
      fallback: Object.freeze([0] as const),
      cycle: staticCycle(0),
    }),
    pitch,
    variation,
    timing,
  } as const satisfies SamplerEventState);
}

describe("native instrument event state", () => {
  it("represents a complete synth as readonly data and narrows the instrument union", () => {
    const synth: SynthEventState = Object.freeze({
      type: "synth",
      notes,
      pitch,
      timing,
    });
    expectTypeOf(synth).toExtend<InstrumentEventState>();
    expectTypeOf(synth.notes).toEqualTypeOf<EventSource<number>>();
    expectTypeOf(synth.notes.cycle).toEqualTypeOf<EventCycle<number>>();
    expect(Object.getPrototypeOf(synth)).toBe(Object.prototype);
    expect(Object.isFrozen(synth)).toBe(true);
    expect(synth.notes).toBe(notes);

    const narrow = (state: InstrumentEventState) => {
      if (state.type === "synth") {
        expectTypeOf(state).toEqualTypeOf<SynthEventState>();
      } else {
        expectTypeOf(state).toEqualTypeOf<SamplerEventState>();
        expectTypeOf(state.sampleNames).toEqualTypeOf<
          StaticEventSource<string> | undefined
        >();
      }
    };
    narrow(synth);
    narrow(samplerState());
  });

  it("represents static sampler names, variation, notes, and resolved pitch data", () => {
    const sampler: SamplerEventState = Object.freeze({
      ...samplerState(),
      notes: Object.freeze({ intent: "authored", cycle: staticCycle(-1.5) }),
      pitch: Object.freeze({
        root: 57,
        scale: Object.freeze([0, 2, 3, 5, 7, 8, 10]),
        hasRequestedTransform: true,
      }),
      sampleNames: Object.freeze({
        intent: "default",
        fallback: Object.freeze(["bd", "hh", "bd"] as const),
        cycle: staticCycle("bd"),
      }),
      variation: Object.freeze({ intent: "authored", cycle: staticCycle(1.5) }),
    });
    expectTypeOf(sampler).toExtend<InstrumentEventState>();
    if (sampler.notes.cycle.type !== "static-event-cycle")
      throw new Error("Expected static notes");
    expect(sampler.notes.cycle.patterns).toEqual([
      [{ type: "event", values: [-1.5] }],
    ]);
    expect(sampler.pitch.scale).toEqual([0, 2, 3, 5, 7, 8, 10]);
    expect(Object.isFrozen(sampler.pitch.scale)).toBe(true);
    expect(sampler.sampleNames?.intent).toBe("default");
    if (sampler.sampleNames?.intent !== "default")
      throw new Error("Expected default names");
    expect(sampler.sampleNames.fallback).toEqual(["bd", "hh", "bd"]);
    expectTypeOf(sampler.sampleNames.cycle).toEqualTypeOf<
      StaticEventCycle<string>
    >();
  });

  it("allows sample names to remain absent or carry authored static intent", () => {
    const sampler: SamplerEventState = samplerState();
    const named: SamplerEventState = Object.freeze({
      ...sampler,
      sampleNames: Object.freeze({
        intent: "authored",
        cycle: staticCycle("sd"),
      }),
    });
    expect(sampler.sampleNames).toBeUndefined();
    expect(sampler.notes.intent).toBe("default");
    expect(sampler.variation.intent).toBe("default");
    expect(named.sampleNames?.intent).toBe("authored");
    expect(named.sampleNames?.cycle.patterns).toEqual([
      [{ type: "event", values: ["sd"] }],
    ]);
  });

  it.each(["notes", "variation"] as const)(
    "retains random %s as authored candidate geometry plus generation metadata",
    (lane) => {
      const sampler: SamplerEventState = Object.freeze({
        ...samplerState(),
        [lane]: Object.freeze({ intent: "authored", cycle: random } as const),
      });
      const source = sampler[lane];
      expect(source.intent).toBe("authored");
      if (source.intent !== "authored")
        throw new Error("Expected authored source");
      expectTypeOf(source.cycle).toEqualTypeOf<EventCycle<number>>();
      expect(source.cycle).toBe(random);
      expect(random.candidateCycle).toBe(candidates);
      expect(random.settings.segments).toEqual([{ seed: 7, len: 4 }]);
      expect(random.settings.valueMap).toEqual([60, 64, 67]);
      expect(random.settings.order).toBe("reverse");
    },
  );

  it("restricts defaults and sample names to static cycles with nonempty fallbacks", () => {
    expectTypeOf<DefaultEventSource<number>["fallback"]>().toEqualTypeOf<
      NonEmptyGroup<number>
    >();
    expectTypeOf<readonly []>().not.toExtend<
      DefaultEventSource<number>["fallback"]
    >();
    expectTypeOf<readonly []>().not.toExtend<
      DefaultEventSource<string>["fallback"]
    >();
    expectTypeOf<DefaultEventSource<number>["cycle"]>().toEqualTypeOf<
      StaticEventCycle<number>
    >();
    expectTypeOf<RandomEventCycle>().not.toExtend<
      DefaultEventSource<number>["cycle"]
    >();
    expectTypeOf<StaticEventSource<string>["cycle"]>().toEqualTypeOf<
      StaticEventCycle<string>
    >();
    expectTypeOf<RandomEventCycle>().not.toExtend<
      StaticEventSource<string>["cycle"]
    >();
    expectTypeOf<RandomEventCycle>().not.toExtend<
      StaticEventSource<number>["cycle"]
    >();
    expectTypeOf<RandomEventCycle>().not.toExtend<
      EventSource<string>["cycle"]
    >();
    expectTypeOf<RandomEventCycle>().toExtend<
      Extract<EventSource<number>, { intent: "authored" }>["cycle"]
    >();
    expectTypeOf<PatternExpression<number>>().not.toExtend<
      EventSource<number>["cycle"]
    >();
  });

  it("preserves an explicit pitch request even when resolved values equal defaults", () => {
    const requested: PitchState = Object.freeze({
      root: 0,
      hasRequestedTransform: true,
    });
    expect(requested.root).toBe(pitch.root);
    expect(requested.scale).toBeUndefined();
    expect(requested.hasRequestedTransform).toBe(true);
    expect(pitch.hasRequestedTransform).toBe(false);
  });

  it.each([0, 0.5, 1])(
    "retains timing chance %s separately from value-generation settings",
    (probability) => {
      const condition: TimingChanceCondition = Object.freeze({
        type: "chance",
        probability,
        segments: Object.freeze([Object.freeze({ seed: 11, len: 8 })]),
        algorithm: "xor",
        order: "reverse",
      });
      const explicit: TimingState = Object.freeze({
        intent: "explicit",
        cycle: candidates,
        condition,
      });
      expectTypeOf(explicit.cycle).toEqualTypeOf<StaticEventCycle<1>>();
      expectTypeOf(explicit.condition).toEqualTypeOf<
        TimingChanceCondition | undefined
      >();
      expectTypeOf<RandomEventCycle>().not.toExtend<TimingState["cycle"]>();
      expect(explicit.condition).toBe(condition);
      expect(explicit.cycle).toBe(candidates);
      expect(condition.probability).toBe(probability);
      expect(condition.segments).toEqual([{ seed: 11, len: 8 }]);
      expect(Object.isFrozen(condition.segments[0])).toBe(true);
      expect(Reflect.set(condition, "probability", 0.25)).toBe(false);
    },
  );

  it("keeps generated timing at the compiler boundary without replacing stored timing", () => {
    const state = samplerState();
    const timingOverride: GeneratedTimingOverride = Object.freeze({
      cycle: Object.freeze([
        Object.freeze([Object.freeze({ offset: 0, duration: 2 })]),
        Object.freeze([]),
      ]),
    });
    const input: SamplerEventCompilerInput = Object.freeze({
      state,
      timingOverride,
    });
    const withoutOverride: SamplerEventCompilerInput = Object.freeze({ state });
    expectTypeOf(input.timingOverride).toEqualTypeOf<
      GeneratedTimingOverride | undefined
    >();
    expect(input.state).toBe(state);
    expect(input.state.timing.cycle).toBe(candidates);
    expect(input.state.timing.intent).toBe("implicit");
    expect(withoutOverride.timingOverride).toBeUndefined();
    expect(input.timingOverride?.cycle).toHaveLength(2);
    expect(input.timingOverride?.cycle[0][0].duration).toBe(2);
    expect(Reflect.set(input, "timingOverride", candidates)).toBe(false);
  });

  it("makes state, source, pitch, timing, and nested metadata readonly", () => {
    // Checked by pnpm check, never executed.
    const attemptMutation = (
      synth: SynthEventState,
      sampler: SamplerEventState,
      source: DefaultEventSource<number>,
      pitchState: PitchState,
      timingState: TimingState,
      condition: TimingChanceCondition,
      input: SamplerEventCompilerInput,
    ) => {
      // @ts-expect-error The instrument discriminant is readonly.
      synth.type = "synth";
      // @ts-expect-error Note sources cannot be replaced in place.
      synth.notes = notes;
      // @ts-expect-error Source intent is readonly.
      synth.notes.intent = "authored";
      // @ts-expect-error Pitch state cannot be replaced in place.
      synth.pitch = pitch;
      // @ts-expect-error Timing state cannot be replaced in place.
      synth.timing = timing;
      // @ts-expect-error Sampler names cannot be replaced in place.
      sampler.sampleNames = { intent: "authored", cycle: staticCycle("sd") };
      // @ts-expect-error Variation cannot be replaced in place.
      sampler.variation = variation;
      // @ts-expect-error Default fallback groups cannot be replaced.
      source.fallback = [60];
      // @ts-expect-error Default fallback groups cannot be appended.
      source.fallback.push(64);
      // @ts-expect-error Cycles cannot be replaced in place.
      source.cycle = staticCycle(60);
      // @ts-expect-error Nested cycle structure remains readonly.
      source.cycle.patterns.push([]);
      // @ts-expect-error Pitch roots are readonly.
      pitchState.root = 60;
      // @ts-expect-error Resolved scales cannot be replaced.
      pitchState.scale = [0, 2, 4];
      // @ts-expect-error Resolved scales cannot be mutated.
      pitchState.scale?.push(5);
      // @ts-expect-error Requested pitch intent is readonly.
      pitchState.hasRequestedTransform = true;
      // @ts-expect-error Timing intent is readonly.
      timingState.intent = "explicit";
      // @ts-expect-error Timing candidates are readonly.
      timingState.cycle = candidates;
      // @ts-expect-error Chance metadata cannot be replaced.
      timingState.condition = condition;
      // @ts-expect-error Chance probability is readonly.
      condition.probability = 0.5;
      // @ts-expect-error Chance segment arrays are readonly.
      condition.segments.push({ seed: 13 });
      // @ts-expect-error Chance segments are readonly.
      condition.segments[0].seed = 13;
      // @ts-expect-error Compiler input state is readonly.
      input.state = sampler;
      // @ts-expect-error Compiler timing overrides are readonly.
      input.timingOverride = candidates;
      // @ts-expect-error Generated timing is not persistent instrument state.
      sampler.timingOverride = candidates;
    };
    expectTypeOf(attemptMutation).toBeFunction();
  });
});
