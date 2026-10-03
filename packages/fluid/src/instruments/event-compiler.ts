import type AuthoredEventValues from "@/patterns/authored-event-values";
import { isDefined } from "@/inputs/guards";
import type AuthoredPitches from "@/patterns/authored-pitches";
import type AuthoredTiming from "@/patterns/authored-timing";
import type {
  NotePattern,
  RandomNumberPattern,
  SamplerEventPattern,
  SampleNamePattern,
  StaticNotePattern,
  TimingPattern,
  TimingStep,
  VariationIndexPattern,
} from "@web-audio/schema";
import { assertCycleBarLimit, assertCycleLimits } from "@web-audio/patterns";
import type { Chord, MaskedCycle } from "@web-audio/patterns";

// TYPES
// —————————————————————————————————————————————————————————————————

type StaticNoteSource = {
  type: "static";
  cycle: MaskedCycle<Chord>;
  fallback?: readonly [number, ...number[]];
  transform: (value: number) => number;
  resolveActiveValues?: boolean;
};

type RandomNoteSource = {
  type: "random";
  pattern: RandomNumberPattern;
  candidateTiming: TimingPattern;
};

type NoteSource = StaticNoteSource | RandomNoteSource;

type NoteEventCompilerInput = {
  source: NoteSource;
  explicitTiming?: TimingPattern;
};

type CompiledNoteEvents = {
  timing: TimingPattern;
  notes: NotePattern;
};

type SamplerTimingCandidate = {
  source: "notes" | "sampleNames" | "variation";
  timing: TimingPattern;
  hasRests: boolean;
};

type FixedAvailability = {
  cycle?: boolean[][];
  valuesPerBar?: number[];
};

type SamplerEventCompilerInput = {
  pitches: AuthoredPitches;
  timing: AuthoredTiming;
  variation: AuthoredEventValues<number>;
  timingOverride?: TimingPattern;
  sampleNames: AuthoredEventValues<string>;
};

// COMPILE NOTE EVENTS
// —————————————————————————————————————————————————————————————————

function compileNoteEvents({ source, explicitTiming }: NoteEventCompilerInput) {
  return source.type === "static"
    ? compileStaticNoteEvents(source, explicitTiming)
    : compileRandomNoteEvents(source, explicitTiming);
}

function compileStaticNoteEvents(
  source: StaticNoteSource,
  explicitTiming: TimingPattern | undefined,
) {
  const sourceBars = source.cycle.activeEvents.map((bar) => {
    const chords = bar.map((chord) => normalizeChord(chord, source.transform));
    return source.resolveActiveValues
      ? chords.filter((chord): chord is number[] => chord !== null)
      : chords;
  });
  const fallback = source.fallback?.map(source.transform);
  const timing = explicitTiming ?? source.cycle.candidateTiming;
  const condition = timing.condition && cloneCondition(timing.condition);
  const cycleLength = repeatingCycleLength(
    sourceBars.length,
    timing.cycle.length,
  );
  const noteCycle: StaticNotePattern["cycle"] = [];
  const timingCycle: TimingPattern["cycle"] = [];

  for (let barIndex = 0; barIndex < cycleLength; barIndex++) {
    const sourceBar = sourceBars[barIndex % sourceBars.length];
    const timingBar = timing.cycle[barIndex % timing.cycle.length];
    const noteBar: StaticNotePattern["cycle"][number] = [];
    const filteredTiming: TimingStep[] = [];

    timingBar.forEach((step, hitIndex) => {
      const chord =
        sourceBar.length === 0
          ? fallback
          : sourceBar[hitIndex % sourceBar.length];
      if (chord === null || chord === undefined) return;
      noteBar.push(chord);
      filteredTiming.push({ ...step });
    });

    noteCycle.push(noteBar.length > 0 ? noteBar : [null]);
    timingCycle.push(filteredTiming);
  }

  assertCycleLimits(timingCycle);
  return {
    timing: { cycle: timingCycle, condition },
    notes: { type: "static", cycle: noteCycle },
  } satisfies CompiledNoteEvents;
}

function compileRandomNoteEvents(
  source: RandomNoteSource,
  explicitTiming: TimingPattern | undefined,
) {
  const timing = explicitTiming ?? source.candidateTiming;
  const condition = timing.condition && cloneCondition(timing.condition);
  const cycleLength = repeatingCycleLength(
    source.pattern.valuesPerBar.length,
    timing.cycle.length,
  );
  const valuesPerBar = Array.from({ length: cycleLength }, (_, barIndex) =>
    explicitTiming
      ? timing.cycle[barIndex % timing.cycle.length].length
      : source.pattern.valuesPerBar[
          barIndex % source.pattern.valuesPerBar.length
        ],
  );
  const timingCycle = Array.from({ length: cycleLength }, (_, barIndex) => {
    if (valuesPerBar[barIndex] === 0) return [];
    return timing.cycle[barIndex % timing.cycle.length].map((step) => ({
      ...step,
    }));
  });

  assertCycleLimits(timingCycle);
  return {
    timing: { cycle: timingCycle, condition },
    notes: {
      ...source.pattern,
      valuesPerBar,
      segments: source.pattern.segments.map((segment) => ({ ...segment })),
      range: source.pattern.range ? { ...source.pattern.range } : undefined,
      valueMap: source.pattern.valueMap
        ? [...source.pattern.valueMap]
        : undefined,
    },
  } satisfies CompiledNoteEvents;
}

function normalizeChord(chord: Chord, transform: (value: number) => number) {
  const voices = (chord ?? [])
    .filter((value): value is number => typeof value === "number")
    .map(transform);
  return voices.length > 0 ? voices : null;
}

function repeatingCycleLength(...lengths: number[]) {
  if (lengths.some((length) => length === 0)) {
    throw new Error("[Fluid] Event patterns must contain at least one bar.");
  }
  const cycleLength = lengths.reduce(lowestCommonMultiple);
  assertCycleBarLimit(cycleLength);
  return cycleLength;
}

// COMPILE SAMPLER EVENTS
// —————————————————————————————————————————————————————————————————

function compileSamplerEvents({
  pitches,
  timing,
  variation,
  timingOverride,
  sampleNames,
}: SamplerEventCompilerInput) {
  const filteredTiming = getSamplerEventTiming({
    pitches,
    timing,
    variation,
    timingOverride,
    sampleNames,
  });
  const noteEvents = pitches.getEventPattern(filteredTiming, true);
  const notes = pitches.hasRequestedPitches ? noteEvents.notes : undefined;

  return finalizeSamplerEvents({
    timing: filteredTiming,
    sampleNames: compileSampleNames(sampleNames),
    notes,
    variationIndices: compileVariationPattern(variation),
    hasAuthoredPitchValues: pitches.hasAuthoredValues,
  });
}

function getSamplerEventTiming(
  input: Omit<SamplerEventCompilerInput, "sampleNames"> & {
    sampleNames?: AuthoredEventValues<string>;
  },
) {
  const { pitches, variation, sampleNames } = input;
  const {
    timing,
    source,
    materializedTiming: selectedMaterializedTiming,
  } = getSamplerTimingSelection(input);
  const pitchesShareSelectedTiming =
    selectedMaterializedTiming !== undefined &&
    pitches.materializedTiming === selectedMaterializedTiming;
  const variationSharesSelectedTiming =
    selectedMaterializedTiming !== undefined &&
    variation.materializedTiming === selectedMaterializedTiming;
  return filterTimingByFixedAvailability(timing, [
    source === "notes" || pitchesShareSelectedTiming
      ? undefined
      : getPitchAvailability(pitches),
    source === "variation" || variationSharesSelectedTiming
      ? undefined
      : getVariationAvailability(variation),
    source === "sampleNames"
      ? undefined
      : getSampleNameAvailability(sampleNames),
  ]);
}

function getSamplerTimingSelection({
  pitches,
  timing,
  variation,
  timingOverride,
  sampleNames,
}: Omit<SamplerEventCompilerInput, "sampleNames"> & {
  sampleNames?: AuthoredEventValues<string>;
}) {
  if (timingOverride) {
    return {
      timing: timingOverride,
      source: undefined,
      materializedTiming: undefined,
    };
  }

  const explicitTiming = timing.getTimingPattern();
  if (explicitTiming) {
    return {
      timing: explicitTiming,
      source: undefined,
      materializedTiming: undefined,
    };
  }

  const candidate = getInferredSamplerTiming({
    pitches,
    variation,
    sampleNames,
  });
  const materializedTiming =
    candidate.source === "notes"
      ? pitches.materializedTiming
      : candidate.source === "variation"
        ? variation.materializedTiming
        : undefined;
  return {
    timing: candidate.timing,
    source: candidate.source,
    materializedTiming,
  };
}

function getInferredSamplerTiming({
  pitches,
  variation,
  sampleNames,
}: Pick<SamplerEventCompilerInput, "pitches" | "variation"> & {
  sampleNames?: AuthoredEventValues<string>;
}) {
  const noteEvents = pitches.getEventPattern();
  return (
    selectSamplerTimingCandidate({
      noteEvents,
      pitches,
      variation,
      sampleNames,
    }) ?? {
      source: "notes",
      timing: noteEvents.timing,
      hasRests: false,
    }
  );
}

function getPitchAvailability(pitches: AuthoredPitches) {
  if (!pitches.hasAuthoredValues) return undefined;

  return {
    cycle: pitches.getFixedAvailability(),
    valuesPerBar: pitches.getRandomValuesPerBar(),
  } satisfies FixedAvailability;
}

function getSampleNameAvailability(
  sampleNames: AuthoredEventValues<string> | undefined,
) {
  if (
    !sampleNames ||
    !sampleNames.hasAuthoredValues ||
    !sampleNames.hasRests ||
    sampleNames.source.type === "random"
  ) {
    return undefined;
  }

  return {
    cycle: sampleNames.getFixedAvailability(),
  } satisfies FixedAvailability;
}

function getVariationAvailability(variation: AuthoredEventValues<number>) {
  if (!variation.hasAuthoredValues) return undefined;

  if (variation.source.type === "random") {
    return {
      valuesPerBar: variation.source.cycle.getRandomSchema().valuesPerBar,
    } satisfies FixedAvailability;
  }

  return {
    cycle: variation.getFixedAvailability(),
  } satisfies FixedAvailability;
}

function selectSamplerTimingCandidate({
  noteEvents,
  pitches,
  variation,
  sampleNames,
}: {
  noteEvents: CompiledNoteEvents;
  pitches: AuthoredPitches;
  variation: AuthoredEventValues<number>;
  sampleNames: AuthoredEventValues<string> | undefined;
}) {
  const noteCandidate = pitches.hasAuthoredValues
    ? ({
        source: "notes",
        timing: noteEvents.timing,
        hasRests: pitches.hasAuthoredPitchRests,
      } satisfies SamplerTimingCandidate)
    : undefined;
  const nameCandidate = getSampleNameTimingCandidate(sampleNames);
  const variationCandidate = getVariationTimingCandidate(variation);
  const candidates = [noteCandidate, nameCandidate, variationCandidate].filter(
    isDefined,
  );

  const restCandidate = candidates.find(
    (candidate) => candidate.hasRests && candidate.source !== "sampleNames",
  );
  if (restCandidate) return restCandidate;

  return candidates.reduce<SamplerTimingCandidate | undefined>(
    (current, candidate) => {
      if (!current || compareTimingDensity(candidate, current) > 0) {
        return candidate;
      }
      return current;
    },
    undefined,
  );
}

function getSampleNameTimingCandidate(
  sampleNames: AuthoredEventValues<string> | undefined,
): SamplerTimingCandidate | undefined {
  if (!sampleNames || !sampleNames.hasAuthoredValues) {
    return undefined;
  }
  if (sampleNames.source.type === "random") return undefined;

  return {
    source: "sampleNames",
    timing: compileStaticTiming(sampleNames.source.cycle),
    hasRests: sampleNames.hasRests,
  };
}

function getVariationTimingCandidate(
  variation: AuthoredEventValues<number>,
): SamplerTimingCandidate | undefined {
  if (!variation.hasAuthoredValues) return undefined;

  if (variation.source.type === "random") {
    return {
      source: "variation",
      timing: variation.source.cycle.candidateTiming,
      hasRests: false,
    };
  }

  return {
    source: "variation",
    timing: compileStaticTiming(variation.source.cycle),
    hasRests: variation.hasRests,
  };
}

function compareTimingDensity(
  left: SamplerTimingCandidate,
  right: SamplerTimingCandidate,
) {
  const leftHits = countTimingHits(left.timing);
  const rightHits = countTimingHits(right.timing);
  return (
    leftHits * right.timing.cycle.length - rightHits * left.timing.cycle.length
  );
}

function countTimingHits(timing: TimingPattern) {
  return timing.cycle.reduce((count, bar) => count + bar.length, 0);
}

function filterTimingByFixedAvailability(
  timing: TimingPattern,
  availabilities: (FixedAvailability | undefined)[],
) {
  const condition = timing.condition && cloneCondition(timing.condition);
  const activeAvailabilities = availabilities.filter(isDefined);

  const availabilityCycleLengths = activeAvailabilities
    .flatMap(({ cycle, valuesPerBar }) => [cycle?.length, valuesPerBar?.length])
    .filter(isDefined);

  const cycleLength = [timing.cycle.length, ...availabilityCycleLengths].reduce(
    lowestCommonMultiple,
  );
  assertCycleBarLimit(cycleLength);

  return {
    condition,
    cycle: Array.from({ length: cycleLength }, (_, barIndex) =>
      timing.cycle[barIndex % timing.cycle.length].filter((_, hitIndex) =>
        activeAvailabilities.every((availability) =>
          isFixedAvailabilityActive(availability, barIndex, hitIndex),
        ),
      ),
    ),
  } satisfies TimingPattern;
}

function isFixedAvailabilityActive(
  availability: FixedAvailability,
  barIndex: number,
  hitIndex: number,
) {
  if (
    availability.valuesPerBar &&
    availability.valuesPerBar[barIndex % availability.valuesPerBar.length] === 0
  ) {
    return false;
  }

  if (!availability.cycle) return true;
  const bar = availability.cycle[barIndex % availability.cycle.length];
  if (bar.length === 0) return false;
  return bar[hitIndex % bar.length];
}

function compileStaticTiming<T>(cycle: (T[] | null)[][]) {
  return {
    cycle: cycle.map((bar) => {
      const duration = 1 / bar.length;
      return bar.flatMap((group, index) =>
        group === null ? [] : [{ offset: index * duration, duration }],
      );
    }),
  } satisfies TimingPattern;
}

function compileSampleNames(values: AuthoredEventValues<string>) {
  if (values.source.type === "random") {
    throw new Error("[Sampler] name() does not support random patterns.");
  }

  const fallback = values.defaultFallback;
  if (fallback) {
    return {
      type: "static",
      cycle: [[[...fallback]]],
    } satisfies SamplerEventPattern["sampleNames"];
  }

  const cycle = values.source.cycle.map((bar) => {
    const activeGroups = bar.flatMap((group) =>
      group === null ? [] : [[...group]],
    );
    return activeGroups.length > 0 ? activeGroups : [null];
  });
  if (!cycle.some((bar) => bar.some((group) => group !== null))) {
    throw new Error(
      "[Sampler] name() must contain at least one sample name before getSchema().",
    );
  }

  return {
    type: "static",
    cycle,
  } satisfies SamplerEventPattern["sampleNames"];
}

function compileVariationPattern(values: AuthoredEventValues<number>) {
  if (values.source.type === "random") {
    return values.source.cycle.getRandomSchema();
  }

  const fallback = values.defaultFallback;
  if (fallback?.length === 1 && fallback[0] === 0) return undefined;
  if (fallback) {
    return {
      type: "static",
      cycle: [[[...fallback]]],
    } satisfies VariationIndexPattern;
  }

  return {
    type: "static",
    cycle: values.source.cycle.map((bar) => {
      const activeGroups = bar.flatMap((group) =>
        group === null ? [] : [[...group]],
      );
      return activeGroups.length > 0 ? activeGroups : [null];
    }),
  } satisfies VariationIndexPattern;
}

function finalizeSamplerEvents({
  sampleNames: inputSampleNames,
  notes: inputNotes,
  variationIndices: inputVariationIndices,
  hasAuthoredPitchValues = false,
  ...eventPattern
}: SamplerEventPattern & { hasAuthoredPitchValues?: boolean }) {
  const cycleLengths = [
    eventPattern.timing.cycle.length,
    getPatternCycleLength(inputSampleNames),
    getPatternCycleLength(inputNotes),
    getPatternCycleLength(inputVariationIndices),
  ].filter(isDefined);
  const cycleLength = cycleLengths.reduce(lowestCommonMultiple);
  assertCycleBarLimit(cycleLength);
  const sampleNames = expandSampleNamePattern(inputSampleNames, cycleLength);
  const notes = inputNotes
    ? expandNotePattern(inputNotes, cycleLength)
    : undefined;
  const variationIndices = inputVariationIndices
    ? expandVariationPattern(inputVariationIndices, cycleLength)
    : undefined;
  const timingCycle = Array.from({ length: cycleLength }, (_, barIndex) => {
    if (
      (hasAuthoredPitchValues && isPatternSilent(notes, barIndex)) ||
      isPatternSilent(variationIndices, barIndex)
    ) {
      return [];
    }
    return eventPattern.timing.cycle[
      barIndex % eventPattern.timing.cycle.length
    ].map((step) => ({ ...step }));
  });

  assertCycleLimits(timingCycle);
  return {
    ...eventPattern,
    timing: { ...eventPattern.timing, cycle: timingCycle },
    sampleNames,
    notes,
    variationIndices,
  } satisfies SamplerEventPattern;
}

function getPatternCycleLength(
  pattern: SampleNamePattern | NotePattern | VariationIndexPattern | undefined,
) {
  if (!pattern) return undefined;
  return pattern.type === "static"
    ? pattern.cycle.length
    : pattern.valuesPerBar.length;
}

function expandSampleNamePattern(
  pattern: SampleNamePattern,
  cycleLength: number,
) {
  return {
    type: "static",
    cycle: repeatCycle(pattern.cycle, cycleLength).map((bar) =>
      bar.map((group) => (group === null ? null : [...group])),
    ),
  } satisfies SampleNamePattern;
}

function expandNotePattern(pattern: NotePattern, cycleLength: number) {
  if (pattern.type === "random-number") {
    return {
      ...pattern,
      valuesPerBar: repeatCycle(pattern.valuesPerBar, cycleLength),
    } satisfies NotePattern;
  }
  return {
    type: "static",
    cycle: repeatCycle(pattern.cycle, cycleLength).map((bar) =>
      bar.map((group) => (group === null ? null : [...group])),
    ),
  } satisfies NotePattern;
}

function expandVariationPattern(
  pattern: VariationIndexPattern,
  cycleLength: number,
) {
  if (pattern.type === "random-number") {
    return {
      ...pattern,
      valuesPerBar: repeatCycle(pattern.valuesPerBar, cycleLength),
    } satisfies VariationIndexPattern;
  }
  return {
    type: "static",
    cycle: repeatCycle(pattern.cycle, cycleLength).map((bar) =>
      bar.map((group) => (group === null ? null : [...group])),
    ),
  } satisfies VariationIndexPattern;
}

function isPatternSilent(
  pattern: NotePattern | VariationIndexPattern | undefined,
  barIndex: number,
) {
  if (!pattern) return false;
  if (pattern.type === "random-number") {
    return pattern.valuesPerBar[barIndex] === 0;
  }
  return pattern.cycle[barIndex][0] === null;
}

function repeatCycle<T>(cycle: T[], cycleLength: number) {
  return Array.from(
    { length: cycleLength },
    (_, index) => cycle[index % cycle.length],
  );
}

function lowestCommonMultiple(a: number, b: number) {
  const product = a * b;
  if (!Number.isSafeInteger(product)) {
    throw new Error("[Pattern] Combined cycle length exceeds safe precision.");
  }
  return product / greatestCommonDivisor(a, b);
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

function cloneCondition(condition: NonNullable<TimingPattern["condition"]>) {
  return {
    ...condition,
    segments: condition.segments.map((segment) => ({ ...segment })),
  };
}

export {
  compileNoteEvents,
  compileSamplerEvents,
  getSamplerEventTiming,
  getSamplerTimingSelection,
  finalizeSamplerEvents,
  compileVariationPattern,
  compileSampleNames,
};
export type {
  NoteEventCompilerInput,
  NoteSource,
  RandomNoteSource,
  SamplerEventCompilerInput,
  StaticNoteSource,
};
