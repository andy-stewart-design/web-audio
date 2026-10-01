import {
  getEventPatternGeometry,
  MAX_EVENT_CYCLE_STEPS,
  MAX_EVENT_CYCLE_VOICES,
  type NonEmptyGroup,
  type StaticEventCycle,
} from "@web-audio/patterns";
import type {
  SamplerEventPattern,
  StaticPattern,
  SynthEventPattern,
  TimingStep,
} from "@web-audio/schema";
import type {
  EventSource,
  InstrumentEventState,
  PitchState,
  SamplerEventState,
  StaticEventSource,
  SynthEventState,
} from "./event-state";
import {
  getCommonEventCycleLength,
  getFilteredEventTiming,
} from "./event-state-geometry";
import { snapshotEventState } from "./event-state-snapshot";

function requireStaticSource<T>(source: EventSource<T>) {
  if (source.cycle.type !== "static-event-cycle")
    throw new Error("[Fluid] Random event compilation is not implemented yet.");
  return { ...source, cycle: source.cycle };
}

function assertStaticTiming(state: InstrumentEventState) {
  if (state.timing.condition)
    throw new Error(
      "[Fluid] Timing chance compilation is not implemented yet.",
    );
}

function activeGroups<T>(cycle: StaticEventCycle<T>) {
  return cycle.patterns.map((pattern) =>
    pattern.flatMap((step) => (step.type === "event" ? [step.values] : [])),
  );
}

function noteGroups(source: StaticEventSource<number>) {
  return source.intent === "default"
    ? source.cycle.patterns.map(() => [source.fallback])
    : activeGroups(source.cycle);
}

function valueGroups<T>(source: StaticEventSource<T>) {
  // Names/variations remain compact hit-addressed patterns in the existing
  // schema. The engine wraps their groups independently by final hit index.
  return source.intent === "default"
    ? [[source.fallback]]
    : activeGroups(source.cycle);
}

function pitchValue(value: number, pitch: PitchState) {
  if (!pitch.scale) return value + pitch.root;
  const length = pitch.scale.length;
  const octave = Math.floor(value / length) * 12;
  const degree = ((value % length) + length) % length;
  return pitch.root + octave + pitch.scale[degree];
}

function timingBars(cycle: StaticEventCycle<1>) {
  return cycle.patterns.map((pattern) =>
    getEventPatternGeometry(pattern).map(({ offset, duration }) => ({
      // Preserve the established schema's grid-index multiplication rounding.
      // Exact rationals remain authoritative until this final numeric boundary.
      offset:
        offset.numerator *
        (pattern.length / offset.denominator) *
        (1 / pattern.length),
      duration: duration.numerator / duration.denominator,
    })),
  );
}

function outputBudget(lane: string) {
  let groups = 0;
  let voices = 0;
  return (barGroups: number, barVoices: number) => {
    groups += barGroups;
    voices += barVoices;
    if (groups > MAX_EVENT_CYCLE_STEPS)
      throw new Error(
        `[Pattern] Compiled ${lane} contains more than ${MAX_EVENT_CYCLE_STEPS} events.`,
      );
    if (voices > MAX_EVENT_CYCLE_VOICES)
      throw new Error(
        `[Pattern] Compiled ${lane} contains more than ${MAX_EVENT_CYCLE_VOICES} voices.`,
      );
  };
}

function wrappingVoices<T>(groups: readonly NonEmptyGroup<T>[], hits: number) {
  if (groups.length === 0) return 0;
  const complete = Math.floor(hits / groups.length);
  const remainder = hits % groups.length;
  return (
    complete * groups.reduce((total, group) => total + group.length, 0) +
    groups.slice(0, remainder).reduce((total, group) => total + group.length, 0)
  );
}

function assertNoteBudget(
  groups: readonly (readonly NonEmptyGroup<number>[])[],
  timing: readonly (readonly TimingStep[])[],
  length: number,
) {
  const budget = outputBudget("notes");
  for (let index = 0; index < length; index++) {
    const bar = groups[index % groups.length];
    const hits = bar.length === 0 ? 0 : timing[index % timing.length].length;
    budget(Math.max(1, hits), wrappingVoices(bar, hits));
  }
}

function compileNotes(
  groups: readonly (readonly NonEmptyGroup<number>[])[],
  timing: readonly (readonly TimingStep[])[],
  length: number,
  pitch: PitchState,
) {
  return {
    type: "static",
    cycle: Array.from({ length }, (_, index) => {
      const bar = groups[index % groups.length];
      const hits = timing[index % timing.length].length;
      if (hits === 0 || bar.length === 0) return [null];
      return Array.from({ length: hits }, (_, hit) =>
        bar[hit % bar.length].map((value) => pitchValue(value, pitch)),
      );
    }),
  } satisfies StaticPattern<number[] | null>;
}

function assertValueBudget<T>(
  groups: readonly (readonly NonEmptyGroup<T>[])[],
  length: number,
  lane: string,
) {
  const budget = outputBudget(lane);
  for (let index = 0; index < length; index++) {
    const bar = groups[index % groups.length];
    budget(
      Math.max(1, bar.length),
      bar.reduce((total, group) => total + group.length, 0),
    );
  }
}

function compileValues<T>(
  groups: readonly (readonly NonEmptyGroup<T>[])[],
  length: number,
) {
  return {
    type: "static",
    cycle: Array.from({ length }, (_, index) => {
      const bar = groups[index % groups.length];
      return bar.length === 0 ? [null] : bar.map((group) => [...group]);
    }),
  } satisfies StaticPattern<T[] | null>;
}

/** Compile native static synth state; input structure and payloads remain untouched. */
function compileSynthEventState(input: SynthEventState) {
  assertStaticTiming(input);
  const state = snapshotEventState(input);
  const source = requireStaticSource(state.notes);
  const groups = noteGroups(source);
  const selected = getFilteredEventTiming(state, { filterSynth: true });
  const timing = timingBars(selected.cycle);
  const length = getCommonEventCycleLength(timing.length, groups.length);
  assertNoteBudget(groups, timing, length);
  const cycle = Array.from({ length }, (_, index) =>
    groups[index % groups.length].length === 0
      ? []
      : timing[index % timing.length].map((step) => ({ ...step })),
  );
  return {
    timing: { cycle },
    notes: compileNotes(groups, cycle, length, state.pitch),
  } satisfies SynthEventPattern;
}

/** Names/variations retain compact value sequences; notes resolve final hit counts. */
function compileSamplerEventState(input: SamplerEventState) {
  assertStaticTiming(input);
  const state = snapshotEventState(input);
  if (!state.sampleNames)
    throw new Error("[Sampler] sample name is required before getSchema().");
  const source = requireStaticSource(state.notes);
  const variation = requireStaticSource(state.variation);
  const names = valueGroups(state.sampleNames);
  if (!names.some((bar) => bar.length > 0))
    throw new Error(
      "[Sampler] name() must contain at least one sample name before getSchema().",
    );
  const includeNotes =
    source.intent === "authored" || state.pitch.hasRequestedTransform;
  const omitVariation =
    variation.intent === "default" &&
    variation.fallback.length === 1 &&
    variation.fallback[0] === 0;
  const notes = noteGroups(source);
  const variations = omitVariation ? undefined : valueGroups(variation);
  const timing = timingBars(getFilteredEventTiming(state).cycle);
  const length = getCommonEventCycleLength(
    timing.length,
    names.length,
    includeNotes ? notes.length : 1,
    variations?.length ?? 1,
  );
  // Empty authored value bars suppress hits even when empty-bar provenance makes
  // their availability transparent. Fallbacks never create or activate timing.
  const silent = (index: number) =>
    names[index % names.length].length === 0 ||
    (source.intent === "authored" &&
      notes[index % notes.length].length === 0) ||
    (variations !== undefined &&
      variations[index % variations.length].length === 0);
  // Budget the final expanded output before allocating schema value groups.
  const timingBudget = outputBudget("timing");
  const noteBudget = outputBudget("notes");
  for (let index = 0; index < length; index++) {
    const hits = silent(index) ? 0 : timing[index % timing.length].length;
    timingBudget(hits, 0);
    if (includeNotes)
      noteBudget(
        Math.max(1, hits),
        wrappingVoices(notes[index % notes.length], hits),
      );
  }
  assertValueBudget(names, length, "sample names");
  if (variations) assertValueBudget(variations, length, "variations");
  const cycle = Array.from({ length }, (_, index) =>
    silent(index)
      ? []
      : timing[index % timing.length].map((step) => ({ ...step })),
  );
  return {
    timing: { cycle },
    sampleNames: compileValues(names, length),
    notes: includeNotes
      ? compileNotes(notes, cycle, length, state.pitch)
      : undefined,
    variationIndices: variations
      ? compileValues(variations, length)
      : undefined,
  } satisfies SamplerEventPattern;
}

export { compileSynthEventState, compileSamplerEventState };
