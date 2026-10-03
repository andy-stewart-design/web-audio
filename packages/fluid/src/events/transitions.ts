import {
  transformEventCycleGeometry,
  MAX_EVENT_CYCLE_STEPS,
  type EventCycle,
  type EventCycleTransform,
  type StaticEventCycle,
} from "@web-audio/patterns";
import type {
  NoteName,
  NoteValue,
  ScaleAlias,
  TimingChanceCondition,
} from "@/types";
import { getScale } from "@/utils/get-scale";
import { noteStringToMidi } from "@/utils/note-string-to-midi";
import type {
  EventSource,
  GeneratedTimingOverride,
  InstrumentEventState,
  SamplerEventState,
  SynthEventState,
} from "./state";
import {
  defaultSource,
  initialAvailability,
  makeCycle,
  materializeEventSources,
  releaseSourceTiming,
} from "./geometry";
import { snapshotEventState } from "./snapshot";

function createSynthEventState() {
  const state: SynthEventState = {
    type: "synth",
    notes: defaultSource([60]),
    pitch: { root: 0, hasRequestedTransform: false },
    timing: {
      intent: "implicit",
      cycle: makeCycle<1>([[{ type: "event", values: [1] }]]),
    },
  };
  return snapshotEventState(state);
}

function createSamplerEventState(sampleName?: string) {
  const state: SamplerEventState = {
    type: "sampler",
    notes: defaultSource([0]),
    pitch: { root: 0, hasRequestedTransform: false },
    sampleNames: sampleName ? defaultSource([sampleName.trim()]) : undefined,
    variation: defaultSource([0]),
    timing: {
      intent: "implicit",
      cycle: makeCycle<1>([[{ type: "event", values: [1] }]]),
    },
  };
  return snapshotEventState(state);
}

function authoredSource<T>(
  cycle: EventCycle<T>,
  zeroWidthPatterns?: readonly boolean[],
) {
  const source: EventSource<T> = {
    intent: "authored",
    cycle,
    zeroWidthPatterns,
  };
  return { ...source, availability: initialAvailability(source) } as const;
}

function releaseEventTiming(state: SynthEventState): SynthEventState;
function releaseEventTiming(state: SamplerEventState): SamplerEventState;
function releaseEventTiming(state: InstrumentEventState): InstrumentEventState;
function releaseEventTiming(state: InstrumentEventState) {
  const notes = releaseSourceTiming(state.notes);
  return state.type === "sampler"
    ? snapshotEventState({
        ...state,
        notes,
        variation: releaseSourceTiming(state.variation),
      })
    : snapshotEventState({ ...state, notes });
}

function afterValueSetter(state: InstrumentEventState) {
  return state.timing.intent === "implicit"
    ? releaseEventTiming(state)
    : snapshotEventState(state);
}

function replaceEventNotes(
  state: SynthEventState,
  cycle: EventCycle<number>,
  zeroWidthPatterns?: readonly boolean[],
  noteValueSlots?: StaticEventCycle<1>,
): SynthEventState;
function replaceEventNotes(
  state: SamplerEventState,
  cycle: EventCycle<number>,
  zeroWidthPatterns?: readonly boolean[],
  noteValueSlots?: StaticEventCycle<1>,
): SamplerEventState;
function replaceEventNotes(
  state: InstrumentEventState,
  cycle: EventCycle<number>,
  zeroWidthPatterns?: readonly boolean[],
  noteValueSlots?: StaticEventCycle<1>,
): InstrumentEventState;
function replaceEventNotes(
  state: InstrumentEventState,
  cycle: EventCycle<number>,
  zeroWidthPatterns?: readonly boolean[],
  noteValueSlots?: StaticEventCycle<1>,
) {
  return afterValueSetter({
    ...state,
    notes: {
      ...authoredSource(cycle, zeroWidthPatterns),
      noteValueSlots,
      materializationExempt:
        cycle.type === "static-event-cycle" &&
        cycle.patterns.length === 1 &&
        cycle.patterns[0].length === 1 &&
        !zeroWidthPatterns?.[0],
    },
  });
}

function replaceSampleNames(
  state: SamplerEventState,
  cycle: StaticEventCycle<string>,
) {
  const result = afterValueSetter({
    ...state,
    sampleNames: authoredSource(cycle),
  });
  if (result.type !== "sampler")
    throw new Error("[Fluid] Expected sampler state.");
  return result;
}

function replaceEventVariation(
  state: SamplerEventState,
  cycle: EventCycle<number>,
  zeroWidthPatterns?: readonly boolean[],
) {
  const result = afterValueSetter({
    ...state,
    variation: authoredSource(cycle, zeroWidthPatterns),
  });
  if (result.type !== "sampler")
    throw new Error("[Fluid] Expected sampler state.");
  return result;
}

function replaceEventTiming(
  state: SynthEventState,
  cycle: StaticEventCycle<1>,
  condition?: TimingChanceCondition,
  zeroWidthPatterns?: readonly boolean[],
): SynthEventState;
function replaceEventTiming(
  state: SamplerEventState,
  cycle: StaticEventCycle<1>,
  condition?: TimingChanceCondition,
  zeroWidthPatterns?: readonly boolean[],
): SamplerEventState;
function replaceEventTiming(
  state: InstrumentEventState,
  cycle: StaticEventCycle<1>,
  condition?: TimingChanceCondition,
  zeroWidthPatterns?: readonly boolean[],
): InstrumentEventState;
function replaceEventTiming(
  state: InstrumentEventState,
  cycle: StaticEventCycle<1>,
  condition?: TimingChanceCondition,
  zeroWidthPatterns?: readonly boolean[],
) {
  return releaseEventTiming({
    ...state,
    timing: {
      intent: "explicit",
      cycle,
      condition: condition ?? state.timing.condition,
      zeroWidthPatterns,
    },
  });
}

/** Fixed rhythms consume existing binary steps in call order; random XOX replaces. */
function composeEventTiming(
  state: SynthEventState,
  mask: StaticEventCycle<1>,
  zeroWidthPatterns?: readonly boolean[],
): SynthEventState;
function composeEventTiming(
  state: SamplerEventState,
  mask: StaticEventCycle<1>,
  zeroWidthPatterns?: readonly boolean[],
): SamplerEventState;
function composeEventTiming(
  state: InstrumentEventState,
  mask: StaticEventCycle<1>,
  zeroWidthPatterns?: readonly boolean[],
): InstrumentEventState;
function composeEventTiming(
  state: InstrumentEventState,
  mask: StaticEventCycle<1>,
  zeroWidthPatterns?: readonly boolean[],
) {
  const snapshot = snapshotEventState(state);
  const modifier = transformEventCycleGeometry(
    mask,
    { type: "fast", multiplier: 1 },
    zeroWidthPatterns,
  );
  const length = Math.max(
    snapshot.timing.cycle.patterns.length,
    modifier.cycle.patterns.length,
  );
  const flags = Array.from(
    { length },
    (_, index) =>
      modifier.zeroWidthPatterns[index % modifier.zeroWidthPatterns.length],
  );
  let steps = 0;
  for (let index = 0; index < length; index++) {
    steps +=
      modifier.cycle.patterns[index % modifier.cycle.patterns.length].length;
    if (steps > MAX_EVENT_CYCLE_STEPS)
      throw new Error(
        `[Pattern] Timing composition produces more than ${MAX_EVENT_CYCLE_STEPS} steps.`,
      );
  }
  const patterns = Array.from({ length }, (_, index) => {
    const source =
      snapshot.timing.cycle.patterns[
        index % snapshot.timing.cycle.patterns.length
      ];
    const sourceEmpty =
      snapshot.timing.zeroWidthPatterns?.[
        index % snapshot.timing.cycle.patterns.length
      ];
    let ordinal = 0;
    return modifier.cycle.patterns[index % modifier.cycle.patterns.length].map(
      (step) => {
        if (step.type !== "event") return { type: "rest" } as const;
        const value = source[ordinal++ % source.length];
        return !sourceEmpty && value.type === "event"
          ? ({ type: "event", values: [1] as const } as const)
          : ({ type: "rest" } as const);
      },
    );
  });
  return replaceEventTiming(snapshot, makeCycle<1>(patterns), undefined, flags);
}

function setEventRoot(
  state: SynthEventState,
  root: NoteName | NoteValue | number,
): SynthEventState;
function setEventRoot(
  state: SamplerEventState,
  root: NoteName | NoteValue | number,
): SamplerEventState;
function setEventRoot(
  state: InstrumentEventState,
  root: NoteName | NoteValue | number,
): InstrumentEventState;
function setEventRoot(
  state: InstrumentEventState,
  root: NoteName | NoteValue | number,
) {
  return snapshotEventState({
    ...state,
    pitch: {
      ...state.pitch,
      root: typeof root === "number" ? root : noteStringToMidi(root) || 0,
      hasRequestedTransform: true,
    },
  });
}

function setEventScale(
  state: SynthEventState,
  name: ScaleAlias,
): SynthEventState;
function setEventScale(
  state: SamplerEventState,
  name: ScaleAlias,
): SamplerEventState;
function setEventScale(
  state: InstrumentEventState,
  name: ScaleAlias,
): InstrumentEventState;
function setEventScale(state: InstrumentEventState, name: ScaleAlias) {
  return snapshotEventState({
    ...state,
    pitch: {
      ...state.pitch,
      scale: getScale(name),
      hasRequestedTransform: true,
    },
  });
}

function transformSource<T>(
  source: EventSource<T>,
  operation: EventCycleTransform,
) {
  if (source.intent === "default")
    return {
      ...source,
      cycle: transformEventCycleGeometry(source.cycle, operation).cycle,
    };
  const geometry = transformEventCycleGeometry(
    source.cycle,
    operation,
    source.zeroWidthPatterns,
  );
  const availability = source.availability
    ? {
        intent: source.availability.intent,
        ...transformEventCycleGeometry(
          source.availability.cycle,
          operation,
          source.availability.zeroWidthPatterns,
        ),
      }
    : undefined;
  const noteValueSlots = source.noteValueSlots
    ? transformEventCycleGeometry(
        source.noteValueSlots,
        operation,
        source.zeroWidthPatterns,
      ).cycle
    : undefined;
  return { ...source, ...geometry, availability, noteValueSlots };
}

function transformEventState(
  state: SynthEventState,
  operation: EventCycleTransform,
  context?: { readonly timingOverride?: GeneratedTimingOverride },
): SynthEventState;
function transformEventState(
  state: SamplerEventState,
  operation: EventCycleTransform,
  context?: { readonly timingOverride?: GeneratedTimingOverride },
): SamplerEventState;
function transformEventState(
  state: InstrumentEventState,
  operation: EventCycleTransform,
  context?: { readonly timingOverride?: GeneratedTimingOverride },
): InstrumentEventState;
function transformEventState(
  state: InstrumentEventState,
  operation: EventCycleTransform,
  context: { readonly timingOverride?: GeneratedTimingOverride } = {},
) {
  const snapshot = snapshotEventState(state);
  const materialized =
    snapshot.type === "sampler" && context.timingOverride
      ? snapshot
      : materializeEventSources(snapshot);
  const condition = materialized.timing.condition;
  const timing = {
    intent: materialized.timing.intent,
    ...transformEventCycleGeometry(
      materialized.timing.cycle,
      operation,
      materialized.timing.zeroWidthPatterns,
    ),
    condition:
      condition && operation.type === "reverse"
        ? {
            ...condition,
            order:
              condition.order === "forward"
                ? ("reverse" as const)
                : ("forward" as const),
          }
        : condition,
  };
  const notes = transformSource(materialized.notes, operation);
  return materialized.type === "sampler"
    ? snapshotEventState({
        ...materialized,
        notes,
        timing,
        sampleNames: materialized.sampleNames
          ? transformSource(materialized.sampleNames, operation)
          : undefined,
        variation: transformSource(materialized.variation, operation),
      })
    : snapshotEventState({ ...materialized, notes, timing });
}

export {
  createSynthEventState,
  createSamplerEventState,
  replaceEventNotes,
  replaceSampleNames,
  replaceEventVariation,
  replaceEventTiming,
  composeEventTiming,
  setEventRoot,
  setEventScale,
  transformEventState,
  releaseEventTiming,
};
