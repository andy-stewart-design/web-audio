import Parameter from "@/patterns/parameter";
import type {
  FitSchema,
  NumberPattern,
  RandomNumberPattern,
  RegionSchema,
  StaticNotePattern,
  StaticValuePattern,
} from "@web-audio/schema";
import type Drome from "@/index";

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

function getNotesForChopTiming(
  notes: StaticNotePattern,
  sequence: StaticValuePattern<number>,
) {
  const noteGroups = notes.cycle
    .flat()
    .filter((group): group is number[] => group !== null);

  const cycle = sequence.cycle.map((bar) => {
    if (noteGroups.length === 0 || bar.length === 0) return [null];
    return bar.map((_, hitIndex) => [
      ...noteGroups[hitIndex % noteGroups.length],
    ]);
  });

  return { type: "static", cycle } satisfies StaticNotePattern;
}

function getDefaultNotesForSequence(
  noteValue: number,
  sequence: NumberPattern,
  chopSchema: ChopState | null,
) {
  const counts =
    sequence.type === "random-number"
      ? sequence.valuesPerBar.length > 0
        ? sequence.valuesPerBar
        : [chopSchema?.sliceCount ?? 1]
      : sequence.cycle.map((bar) => bar.length);

  return {
    type: "static",
    cycle: counts.map((count) =>
      count === 0 ? [null] : Array.from({ length: count }, () => [noteValue]),
    ),
  } satisfies StaticNotePattern;
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

function getDefaultNotes(noteValue: number, noteCount: number, bars: number) {
  const values = Array.from({ length: noteCount }, () => [noteValue]);
  const cycle = distributeAcrossBars(values, bars).map((bar) =>
    bar.length > 0 ? bar : [null],
  );

  return { type: "static", cycle } satisfies StaticNotePattern;
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

function getSourceKeys(bank: string, sample: string, drome: Drome | undefined) {
  const resolvedBank = drome?._resolveBank(bank);
  if (!resolvedBank) {
    console.warn(
      `[Sampler] Bank "${bank}" not found — did you forget to call loadSamples()? ` +
        "Defaulting to sourceKeys: [0]. This sampler will not produce audio.",
    );
    return [0];
  }

  const resolvedSample = resolvedBank.samples[sample];
  if (!resolvedSample) {
    console.warn(
      `[Sampler] Sample "${sample}" not found in bank "${bank}". ` +
        "Defaulting to sourceKeys: [0]. This sampler will not produce audio.",
    );
    return [0];
  }

  return Object.keys(resolvedSample)
    .map(Number)
    .sort((a, b) => a - b);
}

export {
  getChopSequenceSchema,
  getDefaultNotesForSequence,
  getDefaultNotes,
  getNotesForChopTiming,
  getRegion,
  getSourceKeys,
  type ChopState,
  type RegionState,
};
