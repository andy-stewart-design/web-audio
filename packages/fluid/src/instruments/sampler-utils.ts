import Parameter from "@/patterns/parameter";
import type {
  FitSchema,
  NumberPattern,
  RandomNumberPattern,
  RegionSchema,
  StaticPattern,
  TimingPattern,
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
  return { cycle } satisfies TimingPattern;
}

function getDistributedTiming(eventCount: number, bars: number) {
  const cycle: TimingPattern["cycle"] = Array.from({ length: bars }, () => []);
  const duration = bars / eventCount;

  for (let index = 0; index < eventCount; index++) {
    const absoluteOffset = index * duration;
    const barIndex = Math.min(bars - 1, Math.floor(absoluteOffset));
    cycle[barIndex].push({
      offset: absoluteOffset - barIndex,
      duration,
    });
  }

  return { cycle } satisfies TimingPattern;
}

function getChopTiming(chop: ChopState, bars: number) {
  if (!chop.sequence) return getDistributedTiming(chop.sliceCount, bars);
  return getTimingForPattern(getChopSequenceSchema(chop, bars));
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

  return { type: "static", cycle } satisfies StaticPattern<number>;
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
  getChopSequenceSchema,
  getChopTiming,
  getDistributedTiming,
  getRegion,
  getTimingForPattern,
  type ChopState,
  type RegionState,
};
