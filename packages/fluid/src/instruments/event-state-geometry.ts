import {
  assertCycleBarLimit,
  assertEventCycleInvariants,
  MAX_EVENT_CYCLE_STEPS,
  transformEventCycleGeometry,
  type EventPattern,
  type NonEmptyGroup,
  type StaticEventCycle,
} from "@web-audio/patterns";
import type {
  EventSource,
  InstrumentEventState,
  LaneAvailability,
} from "./event-state";

const REST = Object.freeze({ type: "rest" } as const);
const ONSET = Object.freeze({
  type: "event",
  values: Object.freeze([1] as const),
} as const);
const event = <T>(value: T) =>
  ({ type: "event", values: [value] as const }) as const;

function makeCycle<T>(patterns: readonly EventPattern<T>[]) {
  const cycle = { type: "static-event-cycle", patterns } as const;
  assertEventCycleInvariants(cycle);
  return transformEventCycleGeometry(cycle, { type: "fast", multiplier: 1 })
    .cycle;
}

function getCommonEventCycleLength(...lengths: number[]) {
  let result = 1;
  for (const length of lengths) {
    if (length === 0)
      throw new Error("[Fluid] Event patterns must contain at least one bar.");
    let a = result;
    let b = length;
    while (b !== 0) [a, b] = [b, a % b];
    result = (result / a) * length;
    assertCycleBarLimit(result);
  }
  return result;
}

/** Bound repeated grids before allocating their structural cells. */
function buildPatterns<T>(
  length: number,
  width: (index: number) => number,
  build: (index: number) => EventPattern<T>,
) {
  assertCycleBarLimit(length);
  let steps = 0;
  for (let index = 0; index < length; index++) {
    steps += width(index);
    if (steps > MAX_EVENT_CYCLE_STEPS)
      throw new Error(
        `[Pattern] Materialization produces more than ${MAX_EVENT_CYCLE_STEPS} steps.`,
      );
  }
  return Array.from({ length }, (_, index) => build(index));
}

function initialAvailability(source: EventSource<unknown>) {
  if (
    source.intent !== "authored" ||
    source.cycle.type !== "static-event-cycle"
  )
    return undefined;
  return Object.freeze({
    intent: "authored",
    cycle: makeCycle(
      source.cycle.patterns.map((pattern, index) =>
        pattern.map((step) =>
          source.zeroWidthPatterns?.[index]
            ? REST
            : event<boolean | "timing-gap">(step.type !== "rest"),
        ),
      ),
    ),
    zeroWidthPatterns: source.zeroWidthPatterns,
  } as const satisfies LaneAvailability);
}

function getFixedAvailability(source: EventSource<unknown>) {
  const availability =
    source.intent === "authored"
      ? (source.availability ?? initialAvailability(source))
      : undefined;
  if (!availability) return undefined;
  return Object.freeze(
    availability.cycle.patterns.map((pattern, index) => {
      const values = availability.zeroWidthPatterns?.[index]
        ? []
        : pattern.flatMap((step) => {
            if (step.type === "rest")
              return availability.intent === "aligned" ? [] : [false];
            if (step.type === "continuation") return [true];
            const value = step.values[0];
            return value === "timing-gap" ? [] : [value === true];
          });
      return Object.freeze(values.length === 0 ? [true] : values);
    }),
  );
}

function releaseSourceTiming<T>(source: EventSource<T>) {
  if (source.intent !== "authored" || source.availability?.intent !== "aligned")
    return source;
  return Object.freeze({
    ...source,
    availability: Object.freeze({
      ...source.availability,
      intent: "authored",
      cycle: makeCycle(
        source.availability.cycle.patterns.map((pattern) =>
          pattern.map((step) =>
            step.type === "rest" ? event<boolean | "timing-gap">(false) : step,
          ),
        ),
      ),
    } as const),
  });
}

function sourceTiming<T>(
  source: EventSource<T>,
  name: "notes" | "sampleNames" | "variation",
) {
  const cycle =
    source.cycle.type === "static-event-cycle"
      ? source.cycle
      : source.cycle.candidateCycle;
  return {
    cycle: makeCycle<1>(
      cycle.patterns.map((pattern) =>
        pattern.map((step) => (step.type === "event" ? ONSET : step)),
      ),
    ),
    zeroWidthPatterns:
      source.intent === "authored" ? source.zeroWidthPatterns : undefined,
    source: name,
    materializedTiming:
      source.intent === "authored" ? source.materializedTiming : undefined,
    condition: undefined,
    hasRests:
      getFixedAvailability(source)?.some((pattern) =>
        pattern.some((value) => !value),
      ) ?? false,
  };
}

function getSelectedEventTiming(state: InstrumentEventState) {
  if (state.timing.intent === "explicit") {
    const silent = state.timing.condition?.probability === 0;
    return {
      cycle: silent
        ? makeCycle<1>(
            state.timing.cycle.patterns.map((pattern) =>
              pattern.map(() => REST),
            ),
          )
        : state.timing.cycle,
      zeroWidthPatterns: silent
        ? Object.freeze(state.timing.cycle.patterns.map(() => true))
        : state.timing.zeroWidthPatterns,
      source: undefined,
      materializedTiming: undefined,
      condition: state.timing.condition,
      hasRests: false,
    };
  }
  if (state.type === "synth") return sourceTiming(state.notes, "notes");
  const candidates = [
    state.notes.intent === "authored"
      ? sourceTiming(state.notes, "notes")
      : undefined,
    state.sampleNames?.intent === "authored"
      ? sourceTiming(state.sampleNames, "sampleNames")
      : undefined,
    state.variation.intent === "authored"
      ? sourceTiming(state.variation, "variation")
      : undefined,
  ].flatMap((candidate) => (candidate ? [candidate] : []));
  const rest = candidates.find(
    (candidate) => candidate.source !== "sampleNames" && candidate.hasRests,
  );
  if (rest) return rest;
  if (candidates.length === 0) return sourceTiming(state.notes, "notes");
  const hits = (cycle: StaticEventCycle<1>) =>
    cycle.patterns.reduce(
      (count, pattern) =>
        count + pattern.filter((step) => step.type === "event").length,
      0,
    );
  return candidates.reduce((best, candidate) =>
    hits(candidate.cycle) * best.cycle.patterns.length >
    hits(best.cycle) * candidate.cycle.patterns.length
      ? candidate
      : best,
  );
}

/** Shared availability policy for native cycles and external generated timing. */
function getEventAvailabilityFilters(
  state: InstrumentEventState,
  selected: {
    readonly source?: "notes" | "sampleNames" | "variation";
    readonly materializedTiming?: symbol;
  } = {},
) {
  const sources: { name: string; source: EventSource<unknown> }[] = [
    { name: "notes", source: state.notes },
  ];

  if (state.type === "sampler") {
    sources.push({ name: "variation", source: state.variation });
    if (state.sampleNames) {
      sources.push({ name: "sampleNames", source: state.sampleNames });
    }
  }
  return sources.flatMap(({ name, source }) => {
    if (
      source.intent === "default" ||
      name === selected.source ||
      (selected.materializedTiming !== undefined &&
        source.materializedTiming === selected.materializedTiming)
    )
      return [];
    if (source.cycle.type === "random-event-cycle") {
      // Explicit synth timing sets random note counts, including originally empty
      // bars. Samplers instead retain random zero-count availability suppression.
      if (state.type === "synth") return [];
      return [
        {
          patterns: source.cycle.candidateCycle.patterns.map((pattern) => [
            pattern.some((step) => step.type === "event"),
          ]),
        },
      ];
    }
    const patterns = getFixedAvailability(source);
    if (
      !patterns ||
      (name === "sampleNames" &&
        !patterns.some((pattern) => pattern.some((value) => !value)))
    )
      return [];
    return [{ patterns }];
  });
}

function getFilteredEventTiming(
  state: InstrumentEventState,
  options: { readonly filterSynth?: boolean } = {},
) {
  const selected = getSelectedEventTiming(state);
  // Synth materialization uses selected rhythm directly, but compilation applies
  // authored availability. Keep that boundary explicit for transform call order.
  if (state.type === "synth" && !options.filterSynth) return selected;
  const filters = getEventAvailabilityFilters(state, selected);
  const length = getCommonEventCycleLength(
    selected.cycle.patterns.length,
    ...filters.map((filter) => filter.patterns.length),
  );
  const patterns = buildPatterns<1>(
    length,
    (index) =>
      selected.cycle.patterns[index % selected.cycle.patterns.length].length,
    (index) => {
      const pattern =
        selected.cycle.patterns[index % selected.cycle.patterns.length];
      let ordinal = 0;
      let keep = false;
      return pattern.map((step) => {
        if (step.type === "event") {
          keep = filters.every((filter) => {
            const availability =
              filter.patterns[index % filter.patterns.length];
            return availability[ordinal % availability.length];
          });
          ordinal++;
        } else if (step.type === "rest") keep = false;
        return keep ? step : REST;
      });
    },
  );
  return {
    ...selected,
    cycle: makeCycle(patterns),
    zeroWidthPatterns: Object.freeze(
      patterns.map((pattern) => !pattern.some((step) => step.type === "event")),
    ),
  };
}

function canMaterialize<T>(source: EventSource<T>) {
  return (
    source.intent === "authored" &&
    source.cycle.type === "static-event-cycle" &&
    !(
      source.materializationExempt ??
      (source.cycle.patterns.length === 1 &&
        source.cycle.patterns[0].length === 1 &&
        !source.zeroWidthPatterns?.[0])
    )
  );
}

function alignAvailability<T>(
  source: EventSource<T>,
  timing: StaticEventCycle<1>,
) {
  if (
    source.intent !== "authored" ||
    !canMaterialize(source) ||
    source.availability?.intent === "aligned"
  )
    return source;
  const values = getFixedAvailability(source);
  if (!values) return source;
  const length = getCommonEventCycleLength(
    values.length,
    timing.patterns.length,
  );
  const width = (index: number) => {
    const pattern = timing.patterns[index % timing.patterns.length];
    return pattern.some((step) => step.type === "event")
      ? pattern.length
      : values[index % values.length].length;
  };
  const patterns = buildPatterns<boolean | "timing-gap">(
    length,
    width,
    (index) => {
      const pattern = timing.patterns[index % timing.patterns.length];
      const bar = values[index % values.length];
      if (!pattern.some((step) => step.type === "event"))
        return bar.map((value) => event<boolean | "timing-gap">(value));
      let ordinal = 0;
      return pattern.map((step) =>
        event<boolean | "timing-gap">(
          step.type === "event" ? bar[ordinal++ % bar.length] : "timing-gap",
        ),
      );
    },
  );
  return Object.freeze({
    ...source,
    availability: Object.freeze({
      intent: "aligned",
      cycle: makeCycle(patterns),
    } as const),
  });
}

function alignValues<T>(
  source: EventSource<T>,
  timing: StaticEventCycle<1>,
  materializedTiming?: symbol,
) {
  if (
    source.intent !== "authored" ||
    source.cycle.type !== "static-event-cycle" ||
    !canMaterialize(source)
  )
    return source;
  const values = source.cycle.patterns.map((pattern, index) =>
    pattern.flatMap((step, slot) =>
      step.type === "event"
        ? [step.values]
        : source.noteValueSlots?.patterns[index][slot].type === "event"
          ? [undefined]
          : [],
    ),
  );
  const length = getCommonEventCycleLength(
    values.length,
    timing.patterns.length,
  );
  const zeroWidth = (index: number) =>
    !timing.patterns[index % timing.patterns.length].some(
      (step) => step.type === "event",
    );
  const empty = (index: number) =>
    values[index % values.length].length === 0 || zeroWidth(index);
  const patterns = buildPatterns<T>(
    length,
    (index) =>
      zeroWidth(index)
        ? 1
        : timing.patterns[index % timing.patterns.length].length,
    (index) => {
      if (zeroWidth(index)) return [REST];
      const pattern = timing.patterns[index % timing.patterns.length];
      const bar = values[index % values.length];
      // Empty values silence the selected grid; they do not erase its width.
      if (bar.length === 0) return pattern.map(() => REST);
      let ordinal = 0;
      let keep = false;
      return pattern.map((step) => {
        if (step.type === "event") {
          const group = bar[ordinal++ % bar.length];
          keep = group !== undefined;
          return group ? ({ type: "event", values: group } as const) : REST;
        }
        if (step.type === "rest") keep = false;
        // A removed onset silences its entire continuation run.
        return keep ? step : REST;
      });
    },
  );
  return Object.freeze({
    ...source,
    cycle: makeCycle(patterns),
    zeroWidthPatterns: Object.freeze(
      Array.from({ length }, (_, index) => zeroWidth(index)),
    ),
    noteValueSlots: source.noteValueSlots
      ? makeCycle<1>(
          patterns.map((pattern, index) =>
            empty(index)
              ? pattern.map(() => REST)
              : timing.patterns[index % timing.patterns.length],
          ),
        )
      : undefined,
    materializationExempt:
      source.materializationExempt === undefined
        ? undefined
        : length === 1 &&
          !empty(0) &&
          timing.patterns[0].filter((step) => step.type === "event").length ===
            1,
    materializedTiming,
  });
}

function materializeEventSources(state: InstrumentEventState) {
  const selected = getSelectedEventTiming(state);
  const filtered = getFilteredEventTiming(state);
  const shared = <T>(source: EventSource<T>) =>
    source.intent === "authored" &&
    selected.materializedTiming !== undefined &&
    source.materializedTiming === selected.materializedTiming;
  const notes =
    state.type === "sampler" &&
    (selected.source === "notes" || shared(state.notes))
      ? state.notes
      : alignAvailability(state.notes, selected.cycle);
  if (state.type === "synth")
    return { ...state, notes: alignValues(notes, filtered.cycle) };
  const variation =
    selected.source === "variation" || shared(state.variation)
      ? state.variation
      : alignAvailability(state.variation, selected.cycle);
  const group = Symbol("materialized timing");
  return {
    ...state,
    notes: alignValues(notes, filtered.cycle, group),
    variation: alignValues(variation, filtered.cycle, group),
  };
}

function defaultSource<T>(fallback: NonEmptyGroup<T>) {
  if (
    fallback.length === 0 ||
    fallback.some((value) => value === null || value === undefined)
  )
    throw new Error(
      "[Fluid] Default event values require a nonempty fallback group.",
    );
  const [first, ...rest] = fallback;
  return Object.freeze({
    intent: "default",
    fallback: Object.freeze([first, ...rest] as const),
    cycle: makeCycle<T>([[{ type: "event", values: fallback }]]),
  } as const);
}

export {
  makeCycle,
  getCommonEventCycleLength,
  defaultSource,
  initialAvailability,
  getFixedAvailability,
  releaseSourceTiming,
  getSelectedEventTiming,
  getEventAvailabilityFilters,
  getFilteredEventTiming,
  materializeEventSources,
};
