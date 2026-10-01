import {
  assertRandomGenerationMetadata,
  transformEventCycleGeometry,
} from "@web-audio/patterns";
import type { TimingChanceCondition } from "@/types";
import type {
  EventSource,
  InstrumentEventState,
  LaneAvailability,
  SamplerEventState,
  SynthEventState,
} from "./event-state";
import { defaultSource } from "./event-state-geometry";

function snapshotCondition(condition: TimingChanceCondition | undefined) {
  if (!condition) return undefined;
  assertRandomGenerationMetadata(condition);
  if (
    condition.type !== "chance" ||
    !Number.isFinite(condition.probability) ||
    condition.probability < 0 ||
    condition.probability > 1
  ) {
    throw new Error(
      "[Instrument] xox() chance probability must be a finite number from 0 to 1.",
    );
  }
  return Object.freeze({
    ...condition,
    segments: Object.freeze(
      condition.segments.map((segment) => Object.freeze({ ...segment })),
    ),
  });
}

function snapshotAvailability(availability: LaneAvailability | undefined) {
  if (!availability) return undefined;
  if (availability.intent !== "authored" && availability.intent !== "aligned")
    throw new Error("[Fluid] Invalid availability intent.");
  const geometry = transformEventCycleGeometry(
    availability.cycle,
    { type: "fast", multiplier: 1 },
    availability.zeroWidthPatterns,
  );
  for (const pattern of geometry.cycle.patterns)
    for (const step of pattern) {
      if (
        step.type === "event" &&
        (step.values.length !== 1 ||
          (typeof step.values[0] !== "boolean" &&
            step.values[0] !== "timing-gap"))
      )
        throw new Error("[Fluid] Invalid availability value.");
    }
  return Object.freeze({ intent: availability.intent, ...geometry });
}

function snapshotSource<T>(source: EventSource<T>) {
  if (source.intent === "default") {
    return Object.freeze({
      ...defaultSource(source.fallback),
      cycle: transformEventCycleGeometry(source.cycle, {
        type: "fast",
        multiplier: 1,
      }).cycle,
    });
  }
  const geometry = transformEventCycleGeometry(
    source.cycle,
    { type: "fast", multiplier: 1 },
    source.zeroWidthPatterns,
  );
  const noteValueSlots = source.noteValueSlots
    ? transformEventCycleGeometry(
        source.noteValueSlots,
        { type: "fast", multiplier: 1 },
        source.zeroWidthPatterns,
      ).cycle
    : undefined;
  if (noteValueSlots) {
    const cycle = geometry.cycle;
    const fail = () =>
      new Error("[Fluid] Note value slots must match static note geometry.");
    if (cycle.type !== "static-event-cycle") throw fail();
    if (
      noteValueSlots.patterns.length !== cycle.patterns.length ||
      noteValueSlots.patterns.some(
        (pattern, index) =>
          pattern.length !== cycle.patterns[index].length ||
          pattern.some(
            (step) =>
              step.type === "event" &&
              (step.values.length !== 1 || step.values[0] !== 1),
          ),
      )
    )
      throw fail();
  }
  return Object.freeze({
    intent: "authored",
    ...geometry,
    noteValueSlots,
    materializationExempt: source.materializationExempt,
    availability: snapshotAvailability(source.availability),
    materializedTiming: source.materializedTiming,
  } as const);
}

function snapshotEventState(state: SynthEventState): SynthEventState;
function snapshotEventState(state: SamplerEventState): SamplerEventState;
function snapshotEventState(state: InstrumentEventState): InstrumentEventState;
function snapshotEventState(state: InstrumentEventState) {
  const timingGeometry = transformEventCycleGeometry(
    state.timing.cycle,
    { type: "fast", multiplier: 1 },
    state.timing.zeroWidthPatterns,
  );
  const common = {
    notes: snapshotSource(state.notes),
    pitch: Object.freeze({
      ...state.pitch,
      scale:
        state.pitch.scale === undefined
          ? undefined
          : Object.freeze([...state.pitch.scale]),
    }),
    timing: Object.freeze({
      ...state.timing,
      ...timingGeometry,
      condition: snapshotCondition(state.timing.condition),
    }),
  };
  if (state.type === "sampler") {
    const result: SamplerEventState = Object.freeze({
      type: "sampler",
      ...common,
      sampleNames: state.sampleNames
        ? snapshotSource(state.sampleNames)
        : undefined,
      variation: snapshotSource(state.variation),
    });
    return result;
  }
  const result: SynthEventState = Object.freeze({ type: "synth", ...common });
  return result;
}

export { snapshotEventState };
