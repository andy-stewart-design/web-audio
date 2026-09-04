import Parameter from "@/patterns/parameter";
import type {
  FitSchema,
  NotePattern,
  NumberPattern,
  RandomNumberPattern,
  RegionSchema,
  SamplerEventSchema,
  StaticValuePattern,
  TimingSchema,
  VariationIndexPattern,
} from "@web-audio/schema";

type ChopState = { sliceCount: number; sequence: Parameter | null };

type RegionState =
  | { start: Parameter | null; mode: "end"; end: Parameter | null }
  | { start: Parameter | null; mode: "duration"; duration: Parameter };

type RegionOptions = {
  fitSchema: FitSchema | null;
  chopState: ChopState | null;
  chopBars: number;
  region: RegionState | null;
};

function isDefaultRandomPattern(
  schema: NumberPattern,
): schema is RandomNumberPattern {
  return (
    schema.type === "random-number" &&
    schema.valuesPerBar.length === 1 &&
    schema.valuesPerBar[0] === 1
  );
}

function warnOutOfRangeChopIndices(sliceCount: number, schema: NumberPattern) {
  if (schema.type !== "static") return;

  for (const bar of schema.cycle) {
    for (const value of bar) {
      if (value < 0 || value > sliceCount - 1) {
        console.warn(
          `[Sampler] chop() sequence index ${value} is outside [0, ${sliceCount - 1}] and will wrap in the engine.`,
        );
      }
    }
  }
}

function validateRegionParam(
  name: "start" | "end" | "duration",
  schema: NumberPattern,
) {
  if (schema.type === "random-number") {
    if (schema.range && (schema.range.min < 0 || schema.range.max > 1)) {
      console.warn(
        `[Sampler] ${name}() random range is outside [0, 1]; resolved values will be clamped by the engine.`,
      );
    }
    return;
  }

  for (const bar of schema.cycle) {
    for (const value of bar) {
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new Error(
          `[Sampler] ${name}() values must be finite numbers in [0, 1].`,
        );
      }
    }
  }
}

function validateRegionBounds(start: NumberPattern, end: NumberPattern) {
  if (start.type !== "static" || end.type !== "static") return;
  if (start.cycle.length !== 1 || end.cycle.length !== 1) return;
  if (start.cycle[0].length !== 1 || end.cycle[0].length !== 1) return;

  if (start.cycle[0][0] >= end.cycle[0][0]) {
    throw new Error("[Sampler] start() must be less than end().");
  }
}

function getChopSequenceSchema(chop: ChopState, generatedBars = 1) {
  const schema =
    chop.sequence?.getSchema() ??
    getDistributedStaticSchema(
      Array.from({ length: chop.sliceCount }, (_, i) => i),
      generatedBars,
    );

  if (!isDefaultRandomPattern(schema)) return schema;

  return {
    ...schema,
    valuesPerBar: distributeAcrossBars(
      Array.from({ length: chop.sliceCount }, () => 1),
      generatedBars,
    ).map((bar) => bar.length),
  } satisfies NumberPattern;
}

function getTimingForPattern(pattern: NumberPattern) {
  const counts =
    pattern.type === "random-number"
      ? pattern.valuesPerBar
      : pattern.cycle.map((bar) => bar.length);
  const cycle = counts.map((count) =>
    Array.from({ length: count }, (_, index) => ({
      offset: index / count,
      duration: 1 / count,
    })),
  );
  return { cycle } satisfies TimingSchema;
}

function getDistributedTiming(eventCount: number, bars: number) {
  const cycle: TimingSchema["cycle"] = Array.from({ length: bars }, () => []);
  const duration = bars / eventCount;

  for (let index = 0; index < eventCount; index++) {
    const absoluteOffset = index * duration;
    const barIndex = Math.min(bars - 1, Math.floor(absoluteOffset));
    cycle[barIndex].push({
      offset: absoluteOffset - barIndex,
      duration,
    });
  }

  return { cycle } satisfies TimingSchema;
}

function getChopTiming(chop: ChopState, bars: number) {
  if (!chop.sequence) return getDistributedTiming(chop.sliceCount, bars);
  return getTimingForPattern(getChopSequenceSchema(chop, bars));
}

function getVariationIndices(parameter: Parameter) {
  const pattern = parameter.getSchema();
  if (
    pattern.type === "static" &&
    pattern.cycle.length === 1 &&
    pattern.cycle[0].length === 1 &&
    pattern.cycle[0][0] === 0
  ) {
    return undefined;
  }
  if (pattern.type === "random-number") return pattern;

  return {
    type: "static",
    cycle: pattern.cycle.map((bar) => bar.map((value) => [value])),
  } satisfies VariationIndexPattern;
}

function alignSamplerEventCycles({
  notes: inputNotes,
  variationIndices: inputVariationIndices,
  notesFilterTiming = true,
  ...events
}: SamplerEventSchema & { notesFilterTiming?: boolean }) {
  const cycleLengths = [
    events.timing.cycle.length,
    getEventPatternCycleLength(inputNotes),
    getEventPatternCycleLength(inputVariationIndices),
  ].filter((length): length is number => length !== undefined);
  const cycleLength = cycleLengths.reduce(lowestCommonMultiple);
  const expandedNotes = inputNotes
    ? expandNotePattern(inputNotes, cycleLength)
    : undefined;
  const notes =
    expandedNotes && !notesFilterTiming
      ? fillUnavailableNotes(expandedNotes, events.timing, cycleLength)
      : expandedNotes;
  const variationIndices = inputVariationIndices
    ? expandVariationPattern(inputVariationIndices, cycleLength)
    : undefined;
  const timingCycle = Array.from({ length: cycleLength }, (_, barIndex) => {
    if (
      isEventPatternSilent(notes, barIndex) ||
      isEventPatternSilent(variationIndices, barIndex)
    ) {
      return [];
    }
    return events.timing.cycle[barIndex % events.timing.cycle.length].map(
      (step) => ({ ...step }),
    );
  });

  return {
    ...events,
    timing: { ...events.timing, cycle: timingCycle },
    ...(notes && { notes }),
    ...(variationIndices && { variationIndices }),
  } satisfies SamplerEventSchema;
}

function getEventPatternCycleLength(
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
  timing: TimingSchema,
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
    };
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
  };
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

function isEventPatternSilent(
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
  return (a * b) / greatestCommonDivisor(a, b);
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

function distributeAcrossBars<T>(values: T[], bars: number) {
  const cycle: T[][] = Array.from({ length: bars }, () => []);
  const duration = bars / values.length;

  values.forEach((value, valueIndex) => {
    const absoluteOffset = valueIndex * duration;
    const barIndex = Math.min(bars - 1, Math.floor(absoluteOffset));
    cycle[barIndex].push(value);
  });

  return cycle;
}

function getDistributedStaticSchema(values: number[], bars: number) {
  const fallback = values[0] ?? 0;
  const cycle = distributeAcrossBars(values, bars).map((bar) =>
    bar.length > 0 ? bar : [fallback],
  );

  return { type: "static", cycle } satisfies StaticValuePattern<number>;
}

function getStaticChopBounds(start: NumberPattern, end: NumberPattern) {
  if (start.type !== "static" || end.type !== "static") {
    throw new Error(
      "[Sampler] start() and end() must be static numbers when used with chop().",
    );
  }
  if (start.cycle.length !== 1 || end.cycle.length !== 1) {
    throw new Error(
      "[Sampler] start() and end() must be static numbers when used with chop().",
    );
  }
  if (start.cycle[0].length !== 1 || end.cycle[0].length !== 1) {
    throw new Error(
      "[Sampler] start() and end() must be static numbers when used with chop().",
    );
  }

  const startValue = start.cycle[0][0];
  const endValue = end.cycle[0][0];
  if (
    !Number.isFinite(startValue) ||
    !Number.isFinite(endValue) ||
    startValue < 0 ||
    endValue > 1 ||
    startValue >= endValue
  ) {
    throw new Error(
      "[Sampler] start() and end() must satisfy 0 <= start < end <= 1 when used with chop().",
    );
  }

  return { start: startValue, end: endValue, duration: endValue - startValue };
}

function getRegion({ fitSchema, chopState, chopBars, region }: RegionOptions) {
  if (fitSchema) {
    const { bars } = fitSchema;
    return {
      type: "chop",
      slices: Array.from({ length: bars }, (_, i) => ({
        start: i / bars,
        end: (i + 1) / bars,
      })),
      sequence: {
        type: "static",
        cycle: Array.from({ length: bars }, (_, i) => [i]),
      },
    } satisfies RegionSchema;
  }

  const startSchema = (region?.start ?? new Parameter(0)).getSchema();

  if (chopState) {
    if (region?.mode === "duration") {
      throw new Error("[Sampler] duration() cannot be used with chop().");
    }

    const endSchema = (region?.end ?? new Parameter(1)).getSchema();
    const { sliceCount } = chopState;
    const sequenceSchema = getChopSequenceSchema(chopState, chopBars);
    warnOutOfRangeChopIndices(sliceCount, sequenceSchema);
    const bounds = getStaticChopBounds(startSchema, endSchema);

    return {
      type: "chop",
      slices: Array.from({ length: sliceCount }, (_, i) => ({
        start: bounds.start + (i / sliceCount) * bounds.duration,
        end: bounds.start + ((i + 1) / sliceCount) * bounds.duration,
      })),
      sequence: sequenceSchema,
    } satisfies RegionSchema;
  }

  if (!region) return null;

  validateRegionParam("start", startSchema);

  if (region.mode === "duration") {
    const durationSchema = region.duration.getSchema();
    validateRegionParam("duration", durationSchema);

    return {
      type: "static",
      start: startSchema,
      duration: durationSchema,
    } satisfies RegionSchema;
  }

  const endSchema = (region.end ?? new Parameter(1)).getSchema();
  validateRegionParam("end", endSchema);
  validateRegionBounds(startSchema, endSchema);

  return {
    type: "static",
    start: startSchema,
    end: endSchema,
  } satisfies RegionSchema;
}

export {
  alignSamplerEventCycles,
  getChopSequenceSchema,
  getChopTiming,
  getDistributedTiming,
  getRegion,
  getTimingForPattern,
  getVariationIndices,
  type ChopState,
  type RegionState,
};
