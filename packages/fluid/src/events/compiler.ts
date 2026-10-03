import {
  assertCycleBarLimit,
  assertEventCycleInvariants,
  getEventPatternGeometry,
  MAX_RANDOM_EVENT_SETTINGS_ITEMS,
  MAX_EVENT_CYCLE_STEPS,
  MAX_EVENT_CYCLE_VOICES,
  type NonEmptyGroup,
  type RandomEventCycle,
  type RandomEventSettings,
  type StaticEventCycle,
} from "@web-audio/patterns";
import type {
  RandomNumberPattern,
  SamplerEventPattern,
  StaticPattern,
  SynthEventPattern,
  TimingStep,
} from "@web-audio/schema";
import type { TimingChanceCondition } from "@/types";
import type {
  EventSource,
  GeneratedTimingOverride,
  PitchState,
  SamplerEventCompilerInput,
  SamplerEventState,
  StaticEventSource,
  SynthEventState,
} from "./state";
import {
  getCommonEventCycleLength,
  getEventAvailabilityFilters,
  getFilteredEventTiming,
} from "./geometry";
import { snapshotEventState } from "./snapshot";

function numericLane(source: EventSource<number>, notes: boolean) {
  if (source.cycle.type === "random-event-cycle")
    return {
      type: "random",
      cycle: source.cycle,
      counts: source.cycle.candidateCycle.patterns.map(
        (pattern) => pattern.filter((step) => step.type === "event").length,
      ),
    } as const;
  const fixed = { ...source, cycle: source.cycle };
  return {
    type: "static",
    groups: notes ? noteGroups(fixed) : valueGroups(fixed),
  } as const;
}

function laneLength(lane: ReturnType<typeof numericLane>) {
  return lane.type === "static" ? lane.groups.length : lane.counts.length;
}

function laneSilent(lane: ReturnType<typeof numericLane>, index: number) {
  return lane.type === "static"
    ? lane.groups[index % lane.groups.length].length === 0
    : lane.counts[index % lane.counts.length] === 0;
}

function compileCondition(condition: TimingChanceCondition | undefined) {
  if (!condition || condition.probability === 0 || condition.probability === 1)
    return undefined;
  return {
    ...condition,
    segments: condition.segments.map((segment) => ({ ...segment })),
  };
}

function compileRandomValues(
  settings: RandomEventSettings,
  valuesPerBar: number[],
) {
  return {
    ...settings,
    type: "random-number",
    valuesPerBar,
    segments: settings.segments.map((segment) => ({ ...segment })),
    range: settings.range ? { ...settings.range } : undefined,
    valueMap: settings.valueMap ? [...settings.valueMap] : undefined,
  } satisfies RandomNumberPattern;
}

function randomNoteSettings(cycle: RandomEventCycle, pitch: PitchState) {
  const settings = cycle.settings;
  // Retain established random pitch semantics: binary values map degrees 0/1;
  // scale-based numeric generation maps a bounded, max-exclusive degree range.
  // Without a scale, nonbinary generation retains its authored settings.
  if (settings.dataType === "binary") {
    const mapped = {
      ...settings,
      valueMap: [pitchValue(0, pitch), pitchValue(1, pitch)],
      range: undefined,
    };
    assertEventCycleInvariants({ ...cycle, settings: mapped });
    return mapped;
  }
  if (!pitch.scale) return settings;
  const min = Math.floor(settings.range?.min ?? 0);
  const max = Math.ceil(settings.range?.max ?? pitch.scale.length);
  const length = max - min;
  if (
    !Number.isSafeInteger(min) ||
    !Number.isSafeInteger(max) ||
    length <= 0 ||
    length > MAX_RANDOM_EVENT_SETTINGS_ITEMS
  )
    throw new Error(
      `[Fluid] Random note scale map requires 1 to ${MAX_RANDOM_EVENT_SETTINGS_ITEMS} safely representable degrees.`,
    );
  const mapped = {
    ...settings,
    range: undefined,
    valueMap: Array.from({ length }, (_, index) =>
      pitchValue(index + min, pitch),
    ),
  };
  assertEventCycleInvariants({ ...cycle, settings: mapped });
  return mapped;
}

/** Generated gates stay schema geometry, including durations crossing bars. */
function filteredGeneratedTiming(
  state: SamplerEventState,
  override: GeneratedTimingOverride,
) {
  const input = override.cycle;
  if (input.length === 0)
    throw new Error("[Fluid] Generated timing must contain at least one bar.");
  assertCycleBarLimit(input.length);
  const inputBudget = outputBudget("generated timing");
  for (const bar of input) {
    inputBudget(bar.length, 0);
    let previousOffset = -1;
    for (const step of bar) {
      if (
        !Number.isFinite(step.offset) ||
        step.offset < 0 ||
        step.offset >= 1 ||
        !Number.isFinite(step.duration) ||
        step.duration <= 0
      )
        throw new Error(
          "[Fluid] Generated timing requires finite offsets in [0, 1) and positive finite durations.",
        );
      if (step.offset <= previousOffset)
        throw new Error(
          "[Fluid] Generated timing offsets must be strictly increasing within each bar.",
        );
      previousOffset = step.offset;
    }
  }
  const filters = getEventAvailabilityFilters(state);
  const length = getCommonEventCycleLength(
    input.length,
    ...filters.map((filter) => filter.patterns.length),
  );
  const budget = outputBudget("generated timing");
  for (let index = 0; index < length; index++)
    budget(input[index % input.length].length, 0);
  return {
    condition: undefined,
    cycle: Array.from({ length }, (_, index) =>
      input[index % input.length]
        .filter((_, ordinal) =>
          filters.every((filter) => {
            const bar = filter.patterns[index % filter.patterns.length];
            return bar[ordinal % bar.length];
          }),
        )
        .map((step) => ({ ...step })),
    ),
  };
}

function samplerTiming(
  state: SamplerEventState,
  override: GeneratedTimingOverride | undefined,
) {
  if (override) return filteredGeneratedTiming(state, override);
  const selected = getFilteredEventTiming(state);
  return { cycle: timingBars(selected.cycle), condition: selected.condition };
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
  lane: ReturnType<typeof numericLane>,
  hits: number,
  index: number,
  budget: ReturnType<typeof outputBudget>,
) {
  if (lane.type === "random") budget(hits, hits);
  else
    budget(
      Math.max(1, hits),
      wrappingVoices(lane.groups[index % lane.groups.length], hits),
    );
}

function compileNoteLane(
  lane: ReturnType<typeof numericLane>,
  cycle: TimingStep[][],
  pitch: PitchState,
) {
  return lane.type === "static"
    ? compileNotes(lane.groups, cycle, cycle.length, pitch)
    : compileRandomValues(
        randomNoteSettings(lane.cycle, pitch),
        cycle.map((bar) => bar.length),
      );
}

function compileVariationLane(
  lane: ReturnType<typeof numericLane>,
  length: number,
) {
  if (lane.type === "static") {
    assertValueBudget(lane.groups, length, "variations");
    return compileValues(lane.groups, length);
  }
  const budget = outputBudget("random variations");
  for (let index = 0; index < length; index++) {
    const count = lane.counts[index % lane.counts.length];
    budget(count, count);
  }
  return compileRandomValues(
    lane.cycle.settings,
    Array.from(
      { length },
      (_, index) => lane.counts[index % lane.counts.length],
    ),
  );
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

/** Compile native synth state without evaluating random values or timing chance. */
function compileSynthEventState(input: SynthEventState) {
  const state = snapshotEventState(input);
  const notes = numericLane(state.notes, true);
  const selected = getFilteredEventTiming(state, { filterSynth: true });
  const timing = timingBars(selected.cycle);
  const length = getCommonEventCycleLength(timing.length, laneLength(notes));
  const silent = (index: number) =>
    notes.type === "static" && laneSilent(notes, index);
  const timingBudget = outputBudget("timing");
  const noteBudget = outputBudget("notes");
  for (let index = 0; index < length; index++) {
    const hits = silent(index) ? 0 : timing[index % timing.length].length;
    timingBudget(hits, 0);
    assertNoteBudget(notes, hits, index, noteBudget);
  }
  const cycle = Array.from({ length }, (_, index) =>
    silent(index)
      ? []
      : timing[index % timing.length].map((step) => ({ ...step })),
  );
  return {
    timing: { cycle, condition: compileCondition(selected.condition) },
    notes: compileNoteLane(notes, cycle, state.pitch),
  } satisfies SynthEventPattern;
}

/** Names/variations retain compact value sequences; notes resolve final hit counts. */
function compileSamplerEventState(
  input: SamplerEventState,
  { timingOverride }: Omit<SamplerEventCompilerInput, "state"> = {},
) {
  const state = snapshotEventState(input);
  if (!state.sampleNames)
    throw new Error("[Sampler] sample name is required before getSchema().");
  const source = state.notes;
  const variation = state.variation;
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
  const notes = numericLane(source, true);
  const variations = omitVariation ? undefined : numericLane(variation, false);
  const selected = samplerTiming(state, timingOverride);
  const timing = selected.cycle;
  const length = getCommonEventCycleLength(
    timing.length,
    names.length,
    includeNotes ? laneLength(notes) : 1,
    variations ? laneLength(variations) : 1,
  );
  // Empty authored value bars suppress hits even when empty-bar provenance makes
  // their availability transparent. Fallbacks never create or activate timing.
  const silent = (index: number) =>
    names[index % names.length].length === 0 ||
    (source.intent === "authored" && laneSilent(notes, index)) ||
    (variations !== undefined && laneSilent(variations, index));
  // Budget the final expanded output before allocating schema value groups.
  const timingBudget = outputBudget("timing");
  const noteBudget = outputBudget("notes");
  for (let index = 0; index < length; index++) {
    const hits = silent(index) ? 0 : timing[index % timing.length].length;
    timingBudget(hits, 0);
    if (includeNotes) assertNoteBudget(notes, hits, index, noteBudget);
  }
  assertValueBudget(names, length, "sample names");
  const variationIndices = variations
    ? compileVariationLane(variations, length)
    : undefined;
  const cycle = Array.from({ length }, (_, index) =>
    silent(index)
      ? []
      : timing[index % timing.length].map((step) => ({ ...step })),
  );
  return {
    timing: { cycle, condition: compileCondition(selected.condition) },
    sampleNames: compileValues(names, length),
    notes: includeNotes
      ? compileNoteLane(notes, cycle, state.pitch)
      : undefined,
    variationIndices,
  } satisfies SamplerEventPattern;
}

export { compileSynthEventState, compileSamplerEventState };
