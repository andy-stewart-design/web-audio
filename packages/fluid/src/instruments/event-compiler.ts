import {
  hasAuthoredEventValueRests,
  type AuthoredEventValues,
} from "@/patterns/authored-event-values";
import type {
  NotePattern,
  RandomNumberPattern,
  SampleNamePattern,
  SamplerEventPattern,
  StaticNotePattern,
  TimingPattern,
  TimingStep,
  VariationIndexPattern,
} from "@web-audio/schema";
import type { Chord, MaskedCycle } from "@web-audio/patterns";

type StaticNoteSource = {
  type: "static";
  cycle: MaskedCycle<Chord>;
  transform: (value: number) => number;
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

type SamplerEventCompilerInput = {
  getNoteEvents: (timingOverride?: TimingPattern) => CompiledNoteEvents;
  timingOverride?: TimingPattern;
  hasExplicitNotes: boolean;
  hasExplicitRhythm: boolean;
  includeNotes: boolean;
  sampleNames: SampleNamePattern;
  variation: AuthoredEventValues<number>;
};

function compileNoteEvents({ source, explicitTiming }: NoteEventCompilerInput) {
  return source.type === "static"
    ? compileStaticNoteEvents(source, explicitTiming)
    : compileRandomNoteEvents(source, explicitTiming);
}

function compileSamplerEvents({
  getNoteEvents,
  timingOverride,
  hasExplicitNotes,
  hasExplicitRhythm,
  includeNotes,
  sampleNames,
  variation,
}: SamplerEventCompilerInput) {
  const variationTiming = getVariationTimingCandidate({
    variation,
    hasExplicitNotes,
    hasExplicitRhythm,
  });
  const selectedTiming = timingOverride ?? variationTiming;
  const noteEvents = getNoteEvents(selectedTiming);

  return finalizeSamplerEvents({
    timing:
      selectedTiming && !hasExplicitNotes ? selectedTiming : noteEvents.timing,
    sampleNames,
    notes: includeNotes ? noteEvents.notes : undefined,
    variationIndices: compileVariationPattern(variation),
    notesFilterTiming: hasExplicitNotes,
  });
}

function compileStaticNoteEvents(
  source: StaticNoteSource,
  explicitTiming: TimingPattern | undefined,
) {
  const sourceBars = source.cycle.activeEvents.map((bar) =>
    bar.map((chord) => normalizeChord(chord, source.transform)),
  );
  const timing = explicitTiming ?? source.cycle.candidateTiming;
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
        sourceBar.length === 0 ? null : sourceBar[hitIndex % sourceBar.length];
      if (chord === null) return;
      noteBar.push(chord);
      filteredTiming.push({ ...step });
    });

    noteCycle.push(noteBar.length > 0 ? noteBar : [null]);
    timingCycle.push(filteredTiming);
  }

  return {
    timing: {
      cycle: timingCycle,
      ...(timing.condition && { condition: cloneCondition(timing.condition) }),
    },
    notes: { type: "static", cycle: noteCycle },
  } satisfies CompiledNoteEvents;
}

function compileRandomNoteEvents(
  source: RandomNoteSource,
  explicitTiming: TimingPattern | undefined,
) {
  const timing = explicitTiming ?? source.candidateTiming;
  const cycleLength = repeatingCycleLength(
    source.pattern.valuesPerBar.length,
    timing.cycle.length,
  );
  const valuesPerBar = Array.from(
    { length: cycleLength },
    (_, barIndex) =>
      source.pattern.valuesPerBar[
        barIndex % source.pattern.valuesPerBar.length
      ],
  );
  const timingCycle = Array.from({ length: cycleLength }, (_, barIndex) => {
    if (valuesPerBar[barIndex] === 0) return [];
    return timing.cycle[barIndex % timing.cycle.length].map((step) => ({
      ...step,
    }));
  });

  return {
    timing: {
      cycle: timingCycle,
      ...(timing.condition && { condition: cloneCondition(timing.condition) }),
    },
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

function getVariationTimingCandidate({
  variation,
  hasExplicitNotes,
  hasExplicitRhythm,
}: Pick<
  SamplerEventCompilerInput,
  "variation" | "hasExplicitNotes" | "hasExplicitRhythm"
>) {
  if (
    !variation.explicit ||
    variation.source.type !== "static" ||
    hasExplicitNotes ||
    hasExplicitRhythm ||
    !hasAuthoredEventValueRests(variation)
  ) {
    return undefined;
  }

  return compileStaticTiming(variation.source.cycle);
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

function compileVariationPattern(values: AuthoredEventValues<number>) {
  if (values.source.type === "random") {
    return values.source.cycle.getRandomSchema();
  }

  if (isDefaultVariationValues(values)) return undefined;

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

function isDefaultVariationValues(values: AuthoredEventValues<number>) {
  return (
    values.source.type === "static" &&
    values.source.cycle.length === 1 &&
    values.source.cycle[0].length === 1 &&
    values.source.cycle[0][0]?.length === 1 &&
    values.source.cycle[0][0][0] === 0
  );
}

function finalizeSamplerEvents({
  notes: inputNotes,
  variationIndices: inputVariationIndices,
  notesFilterTiming = true,
  ...eventPattern
}: SamplerEventPattern & { notesFilterTiming?: boolean }) {
  const cycleLengths = [
    eventPattern.timing.cycle.length,
    getPatternCycleLength(inputNotes),
    getPatternCycleLength(inputVariationIndices),
  ].filter((length): length is number => length !== undefined);
  const cycleLength = cycleLengths.reduce(lowestCommonMultiple);
  const expandedNotes = inputNotes
    ? expandNotePattern(inputNotes, cycleLength)
    : undefined;
  const notes =
    expandedNotes && !notesFilterTiming
      ? fillUnavailableNotes(expandedNotes, eventPattern.timing, cycleLength)
      : expandedNotes;
  const variationIndices = inputVariationIndices
    ? expandVariationPattern(inputVariationIndices, cycleLength)
    : undefined;
  const timingCycle = Array.from({ length: cycleLength }, (_, barIndex) => {
    if (
      isPatternSilent(notes, barIndex) ||
      isPatternSilent(variationIndices, barIndex)
    ) {
      return [];
    }
    return eventPattern.timing.cycle[
      barIndex % eventPattern.timing.cycle.length
    ].map((step) => ({ ...step }));
  });

  return {
    ...eventPattern,
    timing: { ...eventPattern.timing, cycle: timingCycle },
    ...(notes && { notes }),
    ...(variationIndices && { variationIndices }),
  } satisfies SamplerEventPattern;
}

function getPatternCycleLength(
  pattern: NotePattern | VariationIndexPattern | undefined,
) {
  if (!pattern) return undefined;
  return pattern.type === "static"
    ? pattern.cycle.length
    : pattern.valuesPerBar.length;
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

function fillUnavailableNotes(
  pattern: NotePattern,
  timing: TimingPattern,
  cycleLength: number,
): NotePattern {
  if (pattern.type === "random-number") {
    return {
      ...pattern,
      valuesPerBar: pattern.valuesPerBar.map((count, barIndex) =>
        count === 0
          ? timing.cycle[barIndex % timing.cycle.length].length
          : count,
      ),
    } satisfies NotePattern;
  }

  const fallback = pattern.cycle
    .flat()
    .find((group): group is number[] => group !== null);
  if (!fallback) return pattern;
  return {
    type: "static",
    cycle: Array.from({ length: cycleLength }, (_, barIndex) => {
      const bar = pattern.cycle[barIndex];
      return bar[0] === null ? [[...fallback]] : bar;
    }),
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
  return lengths.reduce(lowestCommonMultiple);
}

function lowestCommonMultiple(a: number, b: number) {
  return (a * b) / greatestCommonDivisor(a, b);
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
  finalizeSamplerEvents,
  compileVariationPattern,
};
export type {
  NoteEventCompilerInput,
  NoteSource,
  RandomNoteSource,
  SamplerEventCompilerInput,
  StaticNoteSource,
};
