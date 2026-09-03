import {
  CLIP_MODES,
  ENVELOPE_MODES,
  FILTER_TYPES,
  MIDI_RANGE_CURVES,
  PATTERN_ORDERS,
  RANDOM_ALGORITHMS,
  RANDOM_DATA_TYPES,
  SAMPLE_DIRECTIONS,
  WAVEFORMS,
  isOneOf,
} from "./constants";
import type { DromeSchema, TimingStep } from "./index";

type TimingCycle = TimingStep[][];

type VoicePatternSummary = {
  cycleLength: number;
  hasRealValue: boolean;
  silentBarIndices: number[];
};

function validateDromeGraph(schema: DromeSchema) {
  if (!isRecord(schema)) {
    throw new Error("[Schema] graph must be an object.");
  }
  if (
    schema.bpm !== undefined &&
    (!isFiniteNumber(schema.bpm) || schema.bpm <= 0)
  ) {
    throw new Error("[Schema] bpm must be a finite number greater than 0.");
  }

  validateBanks(schema.banks);

  if (!isRecord(schema.buses)) {
    throw new Error("[Schema] buses must be an object.");
  }
  for (const [name, bus] of Object.entries(schema.buses)) {
    const path = `Bus "${name}"`;
    if (!isCanonicalName(name)) {
      throw new Error(`[Schema] Bus name "${name}" is not canonical.`);
    }
    if (!isRecord(bus)) {
      throw new Error(`[Schema] ${path} must be an object.`);
    }
    if (!isFiniteNumber(bus.gain) || bus.gain < 0) {
      throw new Error(
        `[Schema] ${path} gain must be a finite number greater than or equal to 0.`,
      );
    }
    if (
      !isFiniteNumber(bus.transition) ||
      bus.transition < 0 ||
      bus.transition > 1
    ) {
      throw new Error(
        `[Schema] ${path} transition must be a finite number in [0, 1].`,
      );
    }
    if (!Array.isArray(bus.effects)) {
      throw new Error(`[Schema] ${path}.effects must be an array.`);
    }
    if (name === "main" && bus.effects.length > 0) {
      throw new Error(
        "[Schema] Effects on main are not supported in the bus MVP.",
      );
    }
    validateEffects(bus.effects, `${path} effects`);
  }

  if (!Array.isArray(schema.instruments)) {
    throw new Error("[Schema] instruments must be an array.");
  }
  schema.instruments.forEach((instrument, index) => {
    const path = `Instrument ${index}`;
    if (!isRecord(instrument)) {
      throw new Error(`[Schema] ${path} must be an object.`);
    }
    if (instrument.type !== "synthesizer" && instrument.type !== "sampler") {
      throw new Error(`[Schema] ${path}.type is invalid.`);
    }

    validateInstrumentCommon(instrument, path, schema);

    if (instrument.type === "synthesizer") {
      validateSynthEvent(instrument.events, `${path}.events`);
      if (instrument.notesOut !== undefined) {
        validateMidiOut(instrument.notesOut, `${path}.notesOut`);
      }
      if (!isOneOf(WAVEFORMS, instrument.waveform)) {
        throw new Error(`[Schema] ${path}.waveform is invalid.`);
      }
      return;
    }

    if (!isNonEmptyString(instrument.bank)) {
      throw new Error(`[Schema] ${path}.bank must be non-empty.`);
    }
    validateSamplerEvent(instrument.events, `${path}.events`);
    validateFit(instrument.fit, `${path}.fit`);
    validateRegion(instrument.region, `${path}.region`);
    if (typeof instrument.loop !== "boolean") {
      throw new Error(`[Schema] ${path}.loop must be a boolean.`);
    }
    if (!isOneOf(CLIP_MODES, instrument.clipMode)) {
      throw new Error(`[Schema] ${path}.clipMode is invalid.`);
    }
    if (!isOneOf(SAMPLE_DIRECTIONS, instrument.direction)) {
      throw new Error(`[Schema] ${path}.direction is invalid.`);
    }
  });
}

function validateInstrumentCommon(
  instrument: Record<string, unknown>,
  path: string,
  schema: DromeSchema,
) {
  if (!isCanonicalName(instrument.route)) {
    throw new Error(
      `[Schema] ${path} route "${String(instrument.route)}" is not canonical.`,
    );
  }
  if (instrument.route !== "main" && !schema.buses[instrument.route]) {
    throw new Error(
      `[Schema] ${path} route "${instrument.route}" does not reference a declared bus.`,
    );
  }

  validateEnvelope(instrument.gain, `${path}.gain`);
  validateAudioParam(instrument.detune, `${path}.detune`);
  validateEffects(instrument.effects, `${path}.effects`);

  if (!isRecord(instrument.sends)) {
    throw new Error(`[Schema] ${path}.sends must be an object.`);
  }
  for (const [target, amount] of Object.entries(instrument.sends)) {
    if (!isCanonicalName(target)) {
      throw new Error(
        `[Schema] ${path} send target "${target}" is not canonical.`,
      );
    }
    if (target === "main") {
      throw new Error(`[Schema] ${path} send cannot target main.`);
    }
    if (!schema.buses[target]) {
      throw new Error(
        `[Schema] ${path} send "${target}" does not reference a declared bus.`,
      );
    }
    if (!isFiniteNumber(amount) || amount < 0 || amount > 1) {
      throw new Error(
        `[Schema] ${path} send "${target}" amount must be a finite number in [0, 1].`,
      );
    }
  }

  if (typeof instrument.muted !== "boolean") {
    throw new Error(`[Schema] ${path}.muted must be a boolean.`);
  }
}

function validateBanks(banks: unknown) {
  if (!isRecord(banks)) {
    throw new Error("[Schema] banks must be an object.");
  }
  for (const [name, bank] of Object.entries(banks)) {
    if (!isNonEmptyString(name)) {
      throw new Error(`[Schema] Bank name "${name}" must be non-empty.`);
    }
    const path = `banks["${name}"]`;
    if (!isRecord(bank)) {
      throw new Error(`[Schema] ${path} must be an object.`);
    }
    if (!isRecord(bank.samples)) {
      throw new Error(`[Schema] ${path}.samples must be an object.`);
    }
    if (Object.keys(bank.samples).length === 0) {
      throw new Error(`[Schema] Bank "${name}" must contain samples.`);
    }
    validateBankSamples(bank.samples, path);
  }
}

function validateBankSamples(samples: Record<string, unknown>, path: string) {
  for (const [sampleName, sourceKeys] of Object.entries(samples)) {
    if (!isNonEmptyString(sampleName)) {
      throw new Error(`[Schema] ${path}.samples has an empty sample name.`);
    }
    const samplePath = `${path}.samples["${sampleName}"]`;
    if (!isRecord(sourceKeys)) {
      throw new Error(`[Schema] ${samplePath} must be an object.`);
    }
    if (Object.keys(sourceKeys).length === 0) {
      throw new Error(`[Schema] ${samplePath} must contain source keys.`);
    }
    for (const [sourceKey, variations] of Object.entries(sourceKeys)) {
      if (!isFiniteNumericString(sourceKey)) {
        throw new Error(
          `[Schema] ${samplePath} source key "${sourceKey}" must be numeric.`,
        );
      }
      const sourcePath = `${samplePath}["${sourceKey}"]`;
      if (!Array.isArray(variations)) {
        throw new Error(`[Schema] ${sourcePath} must be an array.`);
      }
      variations.forEach((variation, index) =>
        validateSampleVariation(variation, `${sourcePath}[${index}]`),
      );
    }
  }
}

function validateSampleVariation(variation: unknown, path: string) {
  if (!isRecord(variation)) {
    throw new Error(`[Schema] ${path} must be an object.`);
  }
  if (variation.type === "file") {
    if (!isNonEmptyString(variation.src)) {
      throw new Error(`[Schema] ${path}.src must be non-empty.`);
    }
    return;
  }

  if (variation.type === "sprite") {
    if (!isNonEmptyString(variation.src)) {
      throw new Error(`[Schema] ${path}.src must be non-empty.`);
    }
    if (
      !isFiniteNumber(variation.start) ||
      !isFiniteNumber(variation.end) ||
      variation.start < 0 ||
      variation.start >= variation.end ||
      variation.end > 1
    ) {
      throw new Error(
        `[Schema] ${path} sprite bounds must be finite and satisfy 0 <= start < end <= 1.`,
      );
    }
    return;
  }

  throw new Error(`[Schema] ${path}.type is invalid.`);
}

function validateEffects(effects: unknown, path: string) {
  if (!Array.isArray(effects)) {
    throw new Error(`[Schema] ${path} must be an array.`);
  }
  effects.forEach((effect, index) => {
    const effectPath = `${path}[${index}]`;
    if (!isRecord(effect)) {
      throw new Error(`[Schema] ${effectPath} must be an object.`);
    }
    if (effect.type === "filter") {
      if (!isOneOf(FILTER_TYPES, effect.filterType)) {
        throw new Error(`[Schema] ${effectPath}.filterType is invalid.`);
      }
      validateAudioParam(effect.frequency, `${effectPath}.frequency`);
      validateAudioParam(effect.q, `${effectPath}.q`);
      validateAudioParam(effect.detune, `${effectPath}.detune`);
      validateAudioParam(effect.gain, `${effectPath}.gain`);
      return;
    }
    if (effect.type === "gain") {
      validateAudioParam(effect.gain, `${effectPath}.gain`);
      return;
    }
    throw new Error(`[Schema] ${effectPath}.type is invalid.`);
  });
}

function validateAudioParam(schema: unknown, path: string) {
  if (!isRecord(schema)) {
    throw new Error(`[Schema] ${path} must be an object.`);
  }
  if (schema.type === "static" || schema.type === "random-number") {
    validateNumberPattern(schema, path);
    return;
  }
  if (schema.type === "envelope") {
    validateEnvelope(schema, path);
    return;
  }
  if (schema.type === "lfo") {
    validateLfo(schema, path);
    return;
  }
  if (schema.type === "midi-cc") {
    validateMidiCc(schema, path);
    return;
  }
  throw new Error(`[Schema] ${path} has an invalid audio parameter type.`);
}

function validateNumberPattern(schema: unknown, path: string) {
  if (!isRecord(schema)) {
    throw new Error(`[Schema] ${path} must be an object.`);
  }
  if (schema.type === "static") {
    validateStaticNumberPattern(schema, path);
    return;
  }
  if (schema.type === "random-number") {
    validateRandomNumberPattern(schema, path);
    return;
  }
  throw new Error(`[Schema] ${path}.type is invalid.`);
}

function validateStaticNumberPattern(
  schema: Record<string, unknown>,
  path: string,
) {
  if (!Array.isArray(schema.cycle) || schema.cycle.length === 0) {
    throw new Error(`[Schema] ${path}.cycle must contain at least one bar.`);
  }
  schema.cycle.forEach((bar, barIndex) => {
    if (!Array.isArray(bar) || bar.length === 0) {
      throw new Error(`[Schema] ${path}.cycle[${barIndex}] cannot be empty.`);
    }
    if (bar.some((value) => !isFiniteNumber(value))) {
      throw new Error(
        `[Schema] ${path}.cycle[${barIndex}] must contain only finite numbers.`,
      );
    }
  });
}

function validateRandomNumberPattern(schema: unknown, path: string) {
  if (!isRecord(schema) || schema.type !== "random-number") {
    throw new Error(`[Schema] ${path}.type must be "random-number".`);
  }
  if (
    !Array.isArray(schema.valuesPerBar) ||
    schema.valuesPerBar.length === 0 ||
    schema.valuesPerBar.some(
      (count) =>
        !isFiniteNumber(count) || !Number.isInteger(count) || count < 0,
    )
  ) {
    throw new Error(
      `[Schema] ${path}.valuesPerBar must contain finite non-negative integers.`,
    );
  }
  validateRandomSettings(schema, path);

  if (Object.prototype.hasOwnProperty.call(schema, "chance")) {
    throw new Error(
      `[Schema] ${path} cannot contain a timing chance condition.`,
    );
  }

  return schema.valuesPerBar.filter(isFiniteNumber);
}

function validateRandomSettings(schema: Record<string, unknown>, path: string) {
  validateSegments(schema.segments, path);

  if (schema.range !== undefined) {
    if (
      !isRecord(schema.range) ||
      !isFiniteNumber(schema.range.min) ||
      !isFiniteNumber(schema.range.max) ||
      !Number.isFinite(schema.range.max - schema.range.min)
    ) {
      throw new Error(
        `[Schema] ${path}.range endpoints and span must be finite.`,
      );
    }
  }

  if (
    schema.quantValue !== undefined &&
    (!isFiniteNumber(schema.quantValue) || schema.quantValue <= 0)
  ) {
    throw new Error(
      `[Schema] ${path}.quantValue must be a positive finite number.`,
    );
  }

  if (schema.valueMap !== undefined) {
    if (
      !Array.isArray(schema.valueMap) ||
      schema.valueMap.length === 0 ||
      schema.valueMap.some((value) => !isFiniteNumber(value)) ||
      (schema.dataType === "binary" && schema.valueMap.length < 2)
    ) {
      throw new Error(
        `[Schema] ${path}.valueMap must contain finite, safely indexable values.`,
      );
    }
  }

  if (!isOneOf(RANDOM_DATA_TYPES, schema.dataType)) {
    throw new Error(`[Schema] ${path}.dataType is invalid.`);
  }
  if (!isOneOf(RANDOM_ALGORITHMS, schema.algorithm)) {
    throw new Error(`[Schema] ${path}.algorithm is invalid.`);
  }
  if (!isOneOf(PATTERN_ORDERS, schema.order)) {
    throw new Error(`[Schema] ${path}.order is invalid.`);
  }
}

function validateSegments(segments: unknown, path: string) {
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new Error(`[Schema] ${path}.segments cannot be empty.`);
  }

  let unboundedCount = 0;
  for (const segment of segments) {
    if (!isRecord(segment) || !isFiniteNumber(segment.seed)) {
      throw new Error(`[Schema] ${path}.segments seeds must be finite.`);
    }
    if (segment.len === undefined) {
      unboundedCount += 1;
    } else if (!isPositiveInteger(segment.len)) {
      throw new Error(
        `[Schema] ${path}.segments lengths must be positive finite integers.`,
      );
    }
  }

  if (unboundedCount > 0 && segments.length !== 1) {
    throw new Error(
      `[Schema] ${path}.segments may contain an unbounded segment only by itself.`,
    );
  }
}

function validateTiming(schema: unknown, path: string): TimingCycle {
  if (!isRecord(schema)) {
    throw new Error(`[Schema] ${path} must be an object.`);
  }
  if (!Array.isArray(schema.cycle) || schema.cycle.length === 0) {
    throw new Error(`[Schema] ${path}.cycle must contain at least one bar.`);
  }

  const cycle: TimingCycle = [];
  schema.cycle.forEach((bar, barIndex) => {
    if (!Array.isArray(bar)) {
      throw new Error(`[Schema] ${path}.cycle[${barIndex}] must be an array.`);
    }
    let previousOffset: number | undefined;
    const validatedBar: TimingCycle[number] = [];
    bar.forEach((step, stepIndex) => {
      const stepPath = `${path}.cycle[${barIndex}][${stepIndex}]`;
      if (!isRecord(step)) {
        throw new Error(`[Schema] ${stepPath} must be an object.`);
      }
      if (!isFiniteNumber(step.offset) || step.offset < 0 || step.offset >= 1) {
        throw new Error(
          `[Schema] ${stepPath}.offset must be finite and in [0, 1).`,
        );
      }
      if (previousOffset !== undefined && step.offset <= previousOffset) {
        throw new Error(
          `[Schema] ${stepPath}.offset must be strictly greater than the previous offset.`,
        );
      }
      if (!isFiniteNumber(step.duration) || step.duration <= 0) {
        throw new Error(
          `[Schema] ${stepPath}.duration must be finite and greater than 0.`,
        );
      }
      previousOffset = step.offset;
      validatedBar.push({ offset: step.offset, duration: step.duration });
    });
    cycle.push(validatedBar);
  });

  if (schema.condition !== undefined) {
    validateChanceCondition(schema.condition, `${path}.condition`);
  }
  return cycle;
}

function validateChanceCondition(condition: unknown, path: string) {
  if (!isRecord(condition)) {
    throw new Error(`[Schema] ${path} must be an object.`);
  }
  if (condition.type !== "chance") {
    throw new Error(`[Schema] ${path}.type must be "chance".`);
  }
  if (
    !isFiniteNumber(condition.probability) ||
    condition.probability < 0 ||
    condition.probability > 1
  ) {
    throw new Error(
      `[Schema] ${path}.probability must be finite and in [0, 1].`,
    );
  }
  validateSegments(condition.segments, path);
  if (!isOneOf(RANDOM_ALGORITHMS, condition.algorithm)) {
    throw new Error(`[Schema] ${path}.algorithm is invalid.`);
  }
  if (!isOneOf(PATTERN_ORDERS, condition.order)) {
    throw new Error(`[Schema] ${path}.order is invalid.`);
  }
}

function validateSynthEvent(schema: unknown, path: string) {
  if (!isRecord(schema)) {
    throw new Error(`[Schema] ${path} must be an object.`);
  }
  const timing = validateTiming(schema.timing, `${path}.timing`);
  validateNotePattern(schema.notes, `${path}.notes`, timing);
}

function validateSamplerEvent(schema: unknown, path: string) {
  if (!isRecord(schema)) {
    throw new Error(`[Schema] ${path} must be an object.`);
  }
  const timing = validateTiming(schema.timing, `${path}.timing`);
  validateSampleNamePattern(schema.sampleNames, `${path}.sampleNames`, timing);
  if (schema.notes !== undefined) {
    validateNotePattern(schema.notes, `${path}.notes`, timing);
  }
  if (schema.variationIndices !== undefined) {
    validateVariationPattern(
      schema.variationIndices,
      `${path}.variationIndices`,
      timing,
    );
  }
}

function validateNotePattern(
  schema: unknown,
  path: string,
  timing: TimingCycle,
) {
  if (isRecord(schema) && schema.type === "static") {
    const summary = validateVoicePattern(schema, path, isFiniteNumber, "note");
    validateStaticEventAlignment(summary, timing, path);
    return;
  }
  if (isRecord(schema) && schema.type === "random-number") {
    const valuesPerBar = validateRandomNumberPattern(schema, path);
    validateRandomTimingAlignment(valuesPerBar, timing, path);
    return;
  }
  throw new Error(`[Schema] ${path}.type is invalid.`);
}

function validateSampleNamePattern(
  schema: unknown,
  path: string,
  timing: TimingCycle,
) {
  if (!isRecord(schema) || schema.type !== "static") {
    throw new Error(`[Schema] ${path}.type must be "static".`);
  }
  const summary = validateVoicePattern(
    schema,
    path,
    isNonEmptyString,
    "sample name",
  );
  if (!summary.hasRealValue) {
    throw new Error(`[Schema] ${path} must contain at least one real name.`);
  }
  validateStaticEventAlignment(summary, timing, path);
}

function validateVariationPattern(
  schema: unknown,
  path: string,
  timing: TimingCycle,
) {
  if (isRecord(schema) && schema.type === "static") {
    const summary = validateVoicePattern(
      schema,
      path,
      isFiniteNumber,
      "variation index",
    );
    validateStaticEventAlignment(summary, timing, path);
    return;
  }
  if (isRecord(schema) && schema.type === "random-number") {
    const valuesPerBar = validateRandomNumberPattern(schema, path);
    validateRandomTimingAlignment(valuesPerBar, timing, path);
    return;
  }
  throw new Error(`[Schema] ${path}.type is invalid.`);
}

function validateVoicePattern(
  schema: Record<string, unknown>,
  path: string,
  isValidVoice: (value: unknown) => boolean,
  label: string,
): VoicePatternSummary {
  if (!Array.isArray(schema.cycle) || schema.cycle.length === 0) {
    throw new Error(`[Schema] ${path}.cycle must contain at least one bar.`);
  }

  let hasRealValue = false;
  const silentBarIndices: number[] = [];
  schema.cycle.forEach((bar, barIndex) => {
    if (!Array.isArray(bar) || bar.length === 0) {
      throw new Error(`[Schema] ${path}.cycle[${barIndex}] cannot be empty.`);
    }
    bar.forEach((group, groupIndex) => {
      if (group === null) {
        if (bar.length !== 1) {
          throw new Error(
            `[Schema] ${path}.cycle[${barIndex}] null must be the only value in a silent bar.`,
          );
        }
        silentBarIndices.push(barIndex);
        return;
      }
      if (!Array.isArray(group) || group.length === 0) {
        throw new Error(
          `[Schema] ${path}.cycle[${barIndex}][${groupIndex}] must be a non-empty ${label} voice group.`,
        );
      }
      hasRealValue = true;
      group.forEach((value, voiceIndex) => {
        if (!isValidVoice(value)) {
          throw new Error(
            `[Schema] ${path}.cycle[${barIndex}][${groupIndex}][${voiceIndex}] is not a valid ${label}.`,
          );
        }
      });
    });
  });

  return {
    cycleLength: schema.cycle.length,
    hasRealValue,
    silentBarIndices,
  };
}

function validateStaticEventAlignment(
  summary: VoicePatternSummary,
  timing: TimingCycle,
  path: string,
) {
  if (summary.silentBarIndices.length === 0) return;

  if (summary.cycleLength !== timing.length) {
    throw new Error(
      `[Schema] ${path} silent bars must align one-to-one with the timing cycle.`,
    );
  }
  for (const index of summary.silentBarIndices) {
    if (timing[index].length !== 0) {
      throw new Error(
        `[Schema] ${path}.cycle[${index}] silent bar must align with an empty timing bar.`,
      );
    }
  }
}

function validateRandomTimingAlignment(
  valuesPerBar: number[],
  timing: TimingCycle,
  path: string,
) {
  const zeroIndices = valuesPerBar.flatMap((count, index) =>
    count === 0 ? [index] : [],
  );
  if (zeroIndices.length === 0) return;

  if (valuesPerBar.length !== timing.length) {
    throw new Error(
      `[Schema] ${path}.valuesPerBar zero counts must align one-to-one with the timing cycle.`,
    );
  }
  for (const index of zeroIndices) {
    if (timing[index].length !== 0) {
      throw new Error(
        `[Schema] ${path}.valuesPerBar[${index}] must align with an empty timing bar.`,
      );
    }
  }
}

function validateEnvelope(schema: unknown, path: string) {
  if (!isRecord(schema)) {
    throw new Error(`[Schema] ${path} must be an object.`);
  }
  if (schema.type !== "envelope") {
    throw new Error(`[Schema] ${path}.type must be "envelope".`);
  }
  if (!isFiniteNumber(schema.min)) {
    throw new Error(`[Schema] ${path}.min must be finite.`);
  }
  validateNumberPattern(schema.max, `${path}.max`);
  validateNumberPattern(schema.a, `${path}.a`);
  validateNumberPattern(schema.d, `${path}.d`);
  validateNumberPattern(schema.s, `${path}.s`);
  validateNumberPattern(schema.r, `${path}.r`);
  if (!isOneOf(ENVELOPE_MODES, schema.mode)) {
    throw new Error(`[Schema] ${path}.mode is invalid.`);
  }
}

function validateLfo(schema: Record<string, unknown>, path: string) {
  if (schema.type !== "lfo") {
    throw new Error(`[Schema] ${path}.type must be "lfo".`);
  }
  if (!isNonEmptyString(schema.id)) {
    throw new Error(`[Schema] ${path}.id must be non-empty.`);
  }
  validateNumberPattern(schema.outputA, `${path}.outputA`);
  validateNumberPattern(schema.outputB, `${path}.outputB`);
  if (
    !Array.isArray(schema.speed) ||
    schema.speed.length === 0 ||
    schema.speed.some((speed) => !isFiniteNumber(speed))
  ) {
    throw new Error(`[Schema] ${path}.speed must contain finite values.`);
  }
  if (
    !Array.isArray(schema.waveform) ||
    schema.waveform.length === 0 ||
    schema.waveform.some((value) => !isOneOf(WAVEFORMS, value))
  ) {
    throw new Error(`[Schema] ${path}.waveform must contain valid waveforms.`);
  }
  if (!isFiniteNumber(schema.phase)) {
    throw new Error(`[Schema] ${path}.phase must be finite.`);
  }
  if (typeof schema.norm !== "boolean" || typeof schema.invert !== "boolean") {
    throw new Error(`[Schema] ${path}.norm and invert must be booleans.`);
  }
}

function validateMidiCc(schema: Record<string, unknown>, path: string) {
  if (schema.type !== "midi-cc") {
    throw new Error(`[Schema] ${path}.type must be "midi-cc".`);
  }
  if (!isIntegerInRange(schema.cc, 0, 127)) {
    throw new Error(`[Schema] ${path}.cc must be an integer in [0, 127].`);
  }
  if (
    schema.channel !== undefined &&
    !isIntegerInRange(schema.channel, 1, 16)
  ) {
    throw new Error(`[Schema] ${path}.channel must be an integer in [1, 16].`);
  }
  if (schema.device !== undefined && !isNonEmptyString(schema.device)) {
    throw new Error(`[Schema] ${path}.device must be non-empty when provided.`);
  }
  if (
    !isRecord(schema.range) ||
    !isFiniteNumber(schema.range.min) ||
    !isFiniteNumber(schema.range.max)
  ) {
    throw new Error(`[Schema] ${path}.range endpoints must be finite.`);
  }
  if (!isOneOf(MIDI_RANGE_CURVES, schema.range.curve)) {
    throw new Error(`[Schema] ${path}.range.curve is invalid.`);
  }
  if (
    schema.range.curve === "exponential" &&
    (schema.range.min <= 0 || schema.range.max <= 0)
  ) {
    throw new Error(
      `[Schema] ${path}.range exponential endpoints must be positive.`,
    );
  }
  if (!isFiniteNumber(schema.default)) {
    throw new Error(`[Schema] ${path}.default must be finite.`);
  }
  const low = Math.min(schema.range.min, schema.range.max);
  const high = Math.max(schema.range.min, schema.range.max);
  if (schema.default < low || schema.default > high) {
    throw new Error(`[Schema] ${path}.default must be within its range.`);
  }
}

function validateMidiOut(schema: unknown, path: string) {
  if (!isRecord(schema)) {
    throw new Error(`[Schema] ${path} must be an object.`);
  }
  if (schema.type !== "midi-out") {
    throw new Error(`[Schema] ${path}.type must be "midi-out".`);
  }
  if (!isIntegerInRange(schema.channel, 1, 16)) {
    throw new Error(`[Schema] ${path}.channel must be an integer in [1, 16].`);
  }
  if (schema.device !== undefined && !isNonEmptyString(schema.device)) {
    throw new Error(`[Schema] ${path}.device must be non-empty when provided.`);
  }
}

function validateFit(schema: unknown, path: string) {
  if (schema === null) return;
  if (!isRecord(schema)) {
    throw new Error(`[Schema] ${path} must be an object or null.`);
  }
  if (schema.type !== "fit") {
    throw new Error(`[Schema] ${path}.type must be "fit".`);
  }
  if (!isPositiveInteger(schema.bars)) {
    throw new Error(`[Schema] ${path}.bars must be a positive integer.`);
  }
}

function validateRegion(schema: unknown, path: string) {
  if (schema === null) return;
  if (!isRecord(schema)) {
    throw new Error(`[Schema] ${path} must be an object or null.`);
  }
  if (schema.type === "static") {
    validateNumberPattern(schema.start, `${path}.start`);
    const hasEnd = schema.end !== undefined;
    const hasDuration = schema.duration !== undefined;
    if (hasEnd === hasDuration) {
      throw new Error(
        `[Schema] ${path} must contain exactly one of end or duration.`,
      );
    }
    validateNumberPattern(
      hasEnd ? schema.end : schema.duration,
      `${path}.${hasEnd ? "end" : "duration"}`,
    );
    return;
  }
  if (schema.type === "chop") {
    if (!Array.isArray(schema.slices) || schema.slices.length === 0) {
      throw new Error(
        `[Schema] ${path}.slices must contain at least one slice.`,
      );
    }
    schema.slices.forEach((slice, index) => {
      if (
        !isRecord(slice) ||
        !isFiniteNumber(slice.start) ||
        !isFiniteNumber(slice.end) ||
        slice.start < 0 ||
        slice.start >= slice.end ||
        slice.end > 1
      ) {
        throw new Error(
          `[Schema] ${path}.slices[${index}] must satisfy 0 <= start < end <= 1.`,
        );
      }
    });
    validateNumberPattern(schema.sequence, `${path}.sequence`);
    return;
  }
  throw new Error(`[Schema] ${path}.type is invalid.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCanonicalName(value: unknown): value is string {
  return typeof value === "string" && value !== "" && value === value.trim();
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumericString(value: string) {
  return value.trim() !== "" && Number.isFinite(Number(value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value > 0;
}

function isIntegerInRange(value: unknown, min: number, max: number) {
  return (
    isFiniteNumber(value) &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

export { validateDromeGraph };
