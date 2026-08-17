import Parameter from "@/patterns/parameter";
import type {
  FitSchema,
  ParameterSchema,
  RegionSchema,
  StaticSchema,
  StaticSchemaValue,
} from "@web-audio/schema";
import type Drome from "@/index";

type ChopState = { sliceCount: number; sequence: Parameter | null };

type RegionState =
  | { start: Parameter | null; mode: "end"; end: Parameter | null }
  | { start: Parameter | null; mode: "duration"; duration: Parameter };

type RegionOptions = {
  fitSchema: FitSchema | null;
  chopState: ChopState | null;
  region: RegionState | null;
};

function isDefaultRandomMask(schema: ParameterSchema) {
  if (schema.type !== "random") return false;
  if (schema.grid.cycle.length !== 1) return false;
  const pattern = schema.grid.cycle[0];
  const [step] = pattern;
  return (
    pattern.length === 1 &&
    step.value === 1 &&
    step.offset === 0 &&
    step.duration === 1 &&
    step.stepIndex === 0
  );
}

function warnOutOfRangeChopIndices(
  sliceCount: number,
  schema: ParameterSchema,
) {
  if (schema.type !== "static") return;

  for (const bar of schema.cycle) {
    for (const step of bar) {
      if (step.value < 0 || step.value > sliceCount - 1) {
        console.warn(
          `[Sampler] chop() sequence index ${step.value} is outside [0, ${sliceCount - 1}] and will wrap in the engine.`,
        );
      }
    }
  }
}

function validateRegionParam(
  name: "start" | "end" | "duration",
  schema: ParameterSchema,
) {
  if (schema.type === "random") {
    if (schema.range && (schema.range.min < 0 || schema.range.max > 1)) {
      console.warn(
        `[Sampler] ${name}() random range is outside [0, 1]; resolved values will be clamped by the engine.`,
      );
    }
    return;
  }

  for (const bar of schema.cycle) {
    for (const step of bar) {
      if (!Number.isFinite(step.value) || step.value < 0 || step.value > 1) {
        throw new Error(
          `[Sampler] ${name}() values must be finite numbers in [0, 1].`,
        );
      }
    }
  }
}

function validateRegionBounds(start: ParameterSchema, end: ParameterSchema) {
  if (start.type !== "static" || end.type !== "static") return;
  if (start.cycle.length !== 1 || end.cycle.length !== 1) return;
  if (start.cycle[0].length !== 1 || end.cycle[0].length !== 1) return;

  if (start.cycle[0][0].value >= end.cycle[0][0].value) {
    throw new Error("[Sampler] start() must be less than end().");
  }
}

function getChopSequenceSchema(chop: {
  sliceCount: number;
  sequence: Parameter | null;
}) {
  const schema =
    chop.sequence?.getSchema() ??
    new Parameter(
      Array.from({ length: chop.sliceCount }, (_, i) => i),
    ).getSchema();

  if (schema.type !== "random") return schema;
  if (!isDefaultRandomMask(schema)) return schema;

  return {
    ...schema,
    grid: {
      type: "static",
      polyphonic: false,
      cycle: [
        Array.from({ length: chop.sliceCount }, (_, stepIndex) => ({
          value: 1,
          offset: stepIndex / chop.sliceCount,
          duration: 1 / chop.sliceCount,
          stepIndex,
        })),
      ],
    },
  } satisfies ParameterSchema;
}

function getNotesForChopTiming(notes: StaticSchema, sequence: StaticSchema) {
  const noteValues = notes.cycle.flat().map((step) => step.value);

  return {
    type: "static",
    polyphonic: notes.polyphonic,
    cycle: sequence.cycle.map((bar) =>
      bar.map(({ offset, duration, stepIndex }) => ({
        value: noteValues[stepIndex % noteValues.length] ?? 0,
        offset,
        duration,
        stepIndex,
      })),
    ),
  } satisfies ParameterSchema;
}

function getDefaultNotesForSequence(
  noteValue: number,
  sequence: ParameterSchema,
  chopSchema: ChopState | null,
) {
  if (sequence.type === "random") {
    return getDefaultNotes(
      noteValue,
      sequence.grid.cycle[0]?.length ?? chopSchema?.sliceCount ?? 1,
      1,
    );
  }

  return {
    type: "static",
    polyphonic: false,
    cycle: sequence.cycle.map((bar) =>
      bar.map(({ offset, duration, stepIndex }) => ({
        value: noteValue,
        offset,
        duration,
        stepIndex,
      })),
    ),
  } satisfies ParameterSchema;
}

function getDefaultNotes(
  noteValue: number,
  noteCount: number,
  bars: number,
  { globalStepIndex = false } = {},
) {
  const cycle: StaticSchemaValue[][] = Array.from({ length: bars }, () => []);
  const duration = bars / noteCount;

  for (let stepIndex = 0; stepIndex < noteCount; stepIndex++) {
    const absoluteOffset = stepIndex * duration;
    const barIndex = Math.min(bars - 1, Math.floor(absoluteOffset));
    const localStepIndex = cycle[barIndex].length;
    cycle[barIndex].push({
      value: noteValue,
      offset: absoluteOffset - barIndex,
      duration,
      stepIndex: globalStepIndex ? stepIndex : localStepIndex,
    });
  }

  return {
    type: "static",
    polyphonic: false,
    cycle,
  } satisfies ParameterSchema;
}

function getStaticChopBounds(start: ParameterSchema, end: ParameterSchema) {
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

  const startValue = start.cycle[0][0].value;
  const endValue = end.cycle[0][0].value;
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

function getRegion({ fitSchema, chopState, region }: RegionOptions) {
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
        polyphonic: false,
        cycle: Array.from({ length: bars }, (_, i) => [
          { value: i, offset: 0, duration: 1, stepIndex: 0 },
        ]),
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
    const sequenceSchema = getChopSequenceSchema(chopState);
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
