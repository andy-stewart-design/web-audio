import type {
  AudioParamSchema,
  BankSchema,
  ChanceCondition,
  DromeSchema,
  EffectSchema,
  EnvelopeSchema,
  FitSchema,
  LfoSchema,
  MidiCcSchema,
  MidiOutSchema,
  NotePattern,
  NumberPattern,
  RandomNumberPattern,
  RegionSchema,
  SampleNamePattern,
  SamplerEventSchema,
  StaticValuePattern,
  SynthEventSchema,
  TimingSchema,
} from "./index";

function validateDromeGraph(schema: DromeSchema) {
  if (
    schema.bpm !== undefined &&
    (!Number.isFinite(schema.bpm) || schema.bpm <= 0)
  ) {
    throw new Error("[Schema] bpm must be a finite number greater than 0.");
  }

  validateBanks(schema.banks);

  for (const [name, bus] of Object.entries(schema.buses)) {
    if (!isCanonicalName(name)) {
      throw new Error(`[Schema] Bus name "${name}" is not canonical.`);
    }
    if (!Number.isFinite(bus.gain) || bus.gain < 0) {
      throw new Error(
        `[Schema] Bus "${name}" gain must be a finite number greater than or equal to 0.`,
      );
    }
    if (
      !Number.isFinite(bus.transition) ||
      bus.transition < 0 ||
      bus.transition > 1
    ) {
      throw new Error(
        `[Schema] Bus "${name}" transition must be a finite number in [0, 1].`,
      );
    }
    if (name === "main" && bus.effects.length > 0) {
      throw new Error(
        "[Schema] Effects on main are not supported in the bus MVP.",
      );
    }
    validateEffects(bus.effects, `Bus "${name}" effects`);
  }

  schema.instruments.forEach((instrument, index) => {
    const path = `Instrument ${index}`;
    validateInstrumentCommon(instrument, path, schema);

    if (instrument.type === "synthesizer") {
      validateSynthEvent(instrument.events, `${path}.events`);
      if (instrument.notesOut !== undefined) {
        validateMidiOut(instrument.notesOut, `${path}.notesOut`);
      }
      if (!isWaveform(instrument.waveform)) {
        throw new Error(`[Schema] ${path}.waveform is invalid.`);
      }
      return;
    }

    if (instrument.type === "sampler") {
      if (!isNonEmptyString(instrument.bank)) {
        throw new Error(`[Schema] ${path}.bank must be non-empty.`);
      }
      validateSamplerEvent(instrument.events, `${path}.events`);
      validateFit(instrument.fit, `${path}.fit`);
      validateRegion(instrument.region, `${path}.region`);
      if (typeof instrument.loop !== "boolean") {
        throw new Error(`[Schema] ${path}.loop must be a boolean.`);
      }
      if (!isClipMode(instrument.clipMode)) {
        throw new Error(`[Schema] ${path}.clipMode is invalid.`);
      }
      if (!isSampleDirection(instrument.direction)) {
        throw new Error(`[Schema] ${path}.direction is invalid.`);
      }
      return;
    }

    throw new Error(`[Schema] ${path}.type is invalid.`);
  });
}

function validateInstrumentCommon(
  instrument: DromeSchema["instruments"][number],
  path: string,
  schema: DromeSchema,
) {
  if (!isCanonicalName(instrument.route)) {
    throw new Error(
      `[Schema] ${path} route "${instrument.route}" is not canonical.`,
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
    if (!Number.isFinite(amount) || amount < 0 || amount > 1) {
      throw new Error(
        `[Schema] ${path} send "${target}" amount must be a finite number in [0, 1].`,
      );
    }
  }

  if (typeof instrument.muted !== "boolean") {
    throw new Error(`[Schema] ${path}.muted must be a boolean.`);
  }
}

function validateBanks(banks: DromeSchema["banks"]) {
  for (const [name, bank] of Object.entries(banks)) {
    if (!isNonEmptyString(name)) {
      throw new Error(`[Schema] Bank name "${name}" must be non-empty.`);
    }
    if (Object.keys(bank.samples).length === 0) {
      throw new Error(`[Schema] Bank "${name}" must contain samples.`);
    }
    validateBank(bank, `banks["${name}"]`);
  }
}

function validateBank(bank: BankSchema, path: string) {
  for (const [sampleName, sourceKeys] of Object.entries(bank.samples)) {
    if (!isNonEmptyString(sampleName)) {
      throw new Error(`[Schema] ${path}.samples has an empty sample name.`);
    }
    if (Object.keys(sourceKeys).length === 0) {
      throw new Error(
        `[Schema] ${path}.samples["${sampleName}"] must contain source keys.`,
      );
    }
    for (const [sourceKey, variations] of Object.entries(sourceKeys)) {
      if (!isFiniteNumericString(sourceKey)) {
        throw new Error(
          `[Schema] ${path}.samples["${sampleName}"] source key "${sourceKey}" must be numeric.`,
        );
      }
      if (!Array.isArray(variations)) {
        throw new Error(
          `[Schema] ${path}.samples["${sampleName}"]["${sourceKey}"] must be an array.`,
        );
      }
      variations.forEach((variation, index) =>
        validateSampleVariation(
          variation,
          `${path}.samples["${sampleName}"]["${sourceKey}"][${index}]`,
        ),
      );
    }
  }
}

function validateSampleVariation(
  variation: BankSchema["samples"][string][string][number],
  path: string,
) {
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
      !Number.isFinite(variation.start) ||
      !Number.isFinite(variation.end) ||
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

function validateEffects(effects: EffectSchema[], path: string) {
  effects.forEach((effect, index) => {
    const effectPath = `${path}[${index}]`;
    if (effect.type === "filter") {
      if (!isFilterType(effect.filterType)) {
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

function validateAudioParam(schema: AudioParamSchema, path: string) {
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

function validateNumberPattern(schema: NumberPattern, path: string) {
  if (schema.type === "static") {
    if (schema.cycle.length === 0) {
      throw new Error(`[Schema] ${path}.cycle must contain at least one bar.`);
    }
    schema.cycle.forEach((bar, barIndex) => {
      if (bar.length === 0) {
        throw new Error(`[Schema] ${path}.cycle[${barIndex}] cannot be empty.`);
      }
      if (bar.some((value) => !Number.isFinite(value))) {
        throw new Error(
          `[Schema] ${path}.cycle[${barIndex}] must contain only finite numbers.`,
        );
      }
    });
    return;
  }

  if (schema.type === "random-number") {
    validateRandomNumberPattern(schema, path);
    return;
  }

  throw new Error(`[Schema] ${path}.type is invalid.`);
}

function validateRandomNumberPattern(
  schema: RandomNumberPattern,
  path: string,
) {
  if (
    schema.valuesPerBar.length === 0 ||
    schema.valuesPerBar.some(
      (count) =>
        !Number.isFinite(count) || !Number.isInteger(count) || count < 0,
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
}

function validateRandomSettings(
  schema: Pick<
    RandomNumberPattern,
    | "segments"
    | "range"
    | "quantValue"
    | "valueMap"
    | "dataType"
    | "algorithm"
    | "order"
  >,
  path: string,
) {
  validateSegments(schema.segments, path);

  if (
    schema.range !== undefined &&
    (!Number.isFinite(schema.range.min) ||
      !Number.isFinite(schema.range.max) ||
      !Number.isFinite(schema.range.max - schema.range.min))
  ) {
    throw new Error(
      `[Schema] ${path}.range endpoints and span must be finite.`,
    );
  }

  if (
    schema.quantValue !== undefined &&
    (!Number.isFinite(schema.quantValue) || schema.quantValue <= 0)
  ) {
    throw new Error(
      `[Schema] ${path}.quantValue must be a positive finite number.`,
    );
  }

  if (
    schema.valueMap !== undefined &&
    (schema.valueMap.length === 0 ||
      schema.valueMap.some((value) => !Number.isFinite(value)) ||
      (schema.dataType === "binary" && schema.valueMap.length < 2))
  ) {
    throw new Error(
      `[Schema] ${path}.valueMap must contain finite, safely indexable values.`,
    );
  }

  if (!isDataType(schema.dataType)) {
    throw new Error(`[Schema] ${path}.dataType is invalid.`);
  }
  if (!isAlgorithm(schema.algorithm)) {
    throw new Error(`[Schema] ${path}.algorithm is invalid.`);
  }
  if (!isOrder(schema.order)) {
    throw new Error(`[Schema] ${path}.order is invalid.`);
  }
}

function validateSegments(
  segments: { seed: number; len?: number }[],
  path: string,
) {
  if (segments.length === 0) {
    throw new Error(`[Schema] ${path}.segments cannot be empty.`);
  }
  if (segments.some(({ seed }) => !Number.isFinite(seed))) {
    throw new Error(`[Schema] ${path}.segments seeds must be finite.`);
  }

  const unbounded = segments.filter(({ len }) => len === undefined);
  if (unbounded.length > 0 && segments.length !== 1) {
    throw new Error(
      `[Schema] ${path}.segments may contain an unbounded segment only by itself.`,
    );
  }
  if (
    segments.some(({ len }) => len !== undefined && !isPositiveInteger(len))
  ) {
    throw new Error(
      `[Schema] ${path}.segments lengths must be positive finite integers.`,
    );
  }
}

function validateTiming(schema: TimingSchema, path: string) {
  if (schema.cycle.length === 0) {
    throw new Error(`[Schema] ${path}.cycle must contain at least one bar.`);
  }
  schema.cycle.forEach((bar, barIndex) => {
    let previousOffset: number | undefined;
    bar.forEach((step, stepIndex) => {
      const stepPath = `${path}.cycle[${barIndex}][${stepIndex}]`;
      if (
        !Number.isFinite(step.offset) ||
        step.offset < 0 ||
        step.offset >= 1
      ) {
        throw new Error(
          `[Schema] ${stepPath}.offset must be finite and in [0, 1).`,
        );
      }
      if (previousOffset !== undefined && step.offset <= previousOffset) {
        throw new Error(
          `[Schema] ${stepPath}.offset must be strictly greater than the previous offset.`,
        );
      }
      if (!Number.isFinite(step.duration) || step.duration <= 0) {
        throw new Error(
          `[Schema] ${stepPath}.duration must be finite and greater than 0.`,
        );
      }
      previousOffset = step.offset;
    });
  });
  if (schema.condition !== undefined) {
    validateChanceCondition(schema.condition, `${path}.condition`);
  }
}

function validateChanceCondition(condition: ChanceCondition, path: string) {
  if (condition.type !== "chance") {
    throw new Error(`[Schema] ${path}.type must be "chance".`);
  }
  if (
    !Number.isFinite(condition.probability) ||
    condition.probability < 0 ||
    condition.probability > 1
  ) {
    throw new Error(
      `[Schema] ${path}.probability must be finite and in [0, 1].`,
    );
  }
  validateSegments(condition.segments, path);
  if (!isAlgorithm(condition.algorithm)) {
    throw new Error(`[Schema] ${path}.algorithm is invalid.`);
  }
  if (!isOrder(condition.order)) {
    throw new Error(`[Schema] ${path}.order is invalid.`);
  }
}

function validateSynthEvent(schema: SynthEventSchema, path: string) {
  validateTiming(schema.timing, `${path}.timing`);
  validateNotePattern(schema.notes, `${path}.notes`, schema.timing);
}

function validateSamplerEvent(schema: SamplerEventSchema, path: string) {
  validateTiming(schema.timing, `${path}.timing`);
  validateSampleNamePattern(
    schema.sampleNames,
    `${path}.sampleNames`,
    schema.timing,
  );
  if (schema.notes !== undefined) {
    validateNotePattern(schema.notes, `${path}.notes`, schema.timing);
  }
  if (schema.variationIndices !== undefined) {
    validateVariationPattern(
      schema.variationIndices,
      `${path}.variationIndices`,
      schema.timing,
    );
  }
}

function validateNotePattern(
  schema: NotePattern,
  path: string,
  timing: TimingSchema,
) {
  if (schema.type === "static") {
    validateVoicePattern(schema, path, isFiniteNumber, "note");
    validateStaticEventAlignment(schema, timing, path);
    return;
  }
  validateRandomNumberPattern(schema, path);
  validateRandomTimingAlignment(schema, timing, path);
}

function validateSampleNamePattern(
  schema: SampleNamePattern,
  path: string,
  timing: TimingSchema,
) {
  const hasRealName =
    schema.type === "static" &&
    validateVoicePattern(schema, path, isNonEmptyString, "sample name");
  if (!hasRealName) {
    throw new Error(`[Schema] ${path} must contain at least one real name.`);
  }
  validateStaticEventAlignment(schema, timing, path);
}

function validateVariationPattern(
  schema: SamplerEventSchema["variationIndices"],
  path: string,
  timing: TimingSchema,
) {
  if (schema === undefined) return;
  if (schema.type === "static") {
    validateVoicePattern(schema, path, isFiniteNumber, "variation index");
    validateStaticEventAlignment(schema, timing, path);
    return;
  }
  validateRandomNumberPattern(schema, path);
  validateRandomTimingAlignment(schema, timing, path);
}

function validateVoicePattern<T>(
  schema: StaticValuePattern<T[] | null>,
  path: string,
  isValidVoice: (value: T) => boolean,
  label: string,
) {
  if (schema.cycle.length === 0) {
    throw new Error(`[Schema] ${path}.cycle must contain at least one bar.`);
  }

  let hasRealValue = false;
  schema.cycle.forEach((bar, barIndex) => {
    if (bar.length === 0) {
      throw new Error(`[Schema] ${path}.cycle[${barIndex}] cannot be empty.`);
    }
    bar.forEach((group, groupIndex) => {
      if (group === null) {
        if (bar.length !== 1) {
          throw new Error(
            `[Schema] ${path}.cycle[${barIndex}] null must be the only value in a silent bar.`,
          );
        }
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
  return hasRealValue;
}

function validateStaticEventAlignment<T>(
  schema: StaticValuePattern<T[] | null>,
  timing: TimingSchema,
  path: string,
) {
  const silentBars = schema.cycle
    .map((bar, index) => ({ bar, index }))
    .filter(({ bar }) => bar.length === 1 && bar[0] === null);
  if (silentBars.length === 0) return;

  if (schema.cycle.length !== timing.cycle.length) {
    throw new Error(
      `[Schema] ${path} silent bars must align one-to-one with the timing cycle.`,
    );
  }
  for (const { bar, index } of silentBars) {
    if (timing.cycle[index].length !== 0 || bar[0] !== null) {
      throw new Error(
        `[Schema] ${path}.cycle[${index}] silent bar must align with an empty timing bar.`,
      );
    }
  }
}

function validateRandomTimingAlignment(
  schema: RandomNumberPattern,
  timing: TimingSchema,
  path: string,
) {
  const zeroBars = schema.valuesPerBar
    .map((count, index) => ({ count, index }))
    .filter(({ count }) => count === 0);
  if (zeroBars.length === 0) return;

  if (schema.valuesPerBar.length !== timing.cycle.length) {
    throw new Error(
      `[Schema] ${path}.valuesPerBar zero counts must align one-to-one with the timing cycle.`,
    );
  }
  for (const { index } of zeroBars) {
    if (timing.cycle[index].length !== 0) {
      throw new Error(
        `[Schema] ${path}.valuesPerBar[${index}] must align with an empty timing bar.`,
      );
    }
  }
}

function validateEnvelope(schema: EnvelopeSchema, path: string) {
  if (!Number.isFinite(schema.min)) {
    throw new Error(`[Schema] ${path}.min must be finite.`);
  }
  validateNumberPattern(schema.max, `${path}.max`);
  validateNumberPattern(schema.a, `${path}.a`);
  validateNumberPattern(schema.d, `${path}.d`);
  validateNumberPattern(schema.s, `${path}.s`);
  validateNumberPattern(schema.r, `${path}.r`);
  if (schema.mode !== "bleed" && schema.mode !== "bounded") {
    throw new Error(`[Schema] ${path}.mode is invalid.`);
  }
}

function validateLfo(schema: LfoSchema, path: string) {
  if (!isNonEmptyString(schema.id)) {
    throw new Error(`[Schema] ${path}.id must be non-empty.`);
  }
  validateNumberPattern(schema.outputA, `${path}.outputA`);
  validateNumberPattern(schema.outputB, `${path}.outputB`);
  if (
    schema.speed.length === 0 ||
    schema.speed.some((speed) => !Number.isFinite(speed))
  ) {
    throw new Error(`[Schema] ${path}.speed must contain finite values.`);
  }
  if (
    schema.waveform.length === 0 ||
    schema.waveform.some((value) => !isWaveform(value))
  ) {
    throw new Error(`[Schema] ${path}.waveform must contain valid waveforms.`);
  }
  if (!Number.isFinite(schema.phase)) {
    throw new Error(`[Schema] ${path}.phase must be finite.`);
  }
  if (typeof schema.norm !== "boolean" || typeof schema.invert !== "boolean") {
    throw new Error(`[Schema] ${path}.norm and invert must be booleans.`);
  }
}

function validateMidiCc(schema: MidiCcSchema, path: string) {
  if (!Number.isInteger(schema.cc) || schema.cc < 0 || schema.cc > 127) {
    throw new Error(`[Schema] ${path}.cc must be an integer in [0, 127].`);
  }
  if (
    schema.channel !== undefined &&
    (!Number.isInteger(schema.channel) ||
      schema.channel < 1 ||
      schema.channel > 16)
  ) {
    throw new Error(`[Schema] ${path}.channel must be an integer in [1, 16].`);
  }
  if (
    !Number.isFinite(schema.range.min) ||
    !Number.isFinite(schema.range.max)
  ) {
    throw new Error(`[Schema] ${path}.range endpoints must be finite.`);
  }
  if (schema.range.curve !== "linear" && schema.range.curve !== "exponential") {
    throw new Error(`[Schema] ${path}.range.curve is invalid.`);
  }
  if (!Number.isFinite(schema.default)) {
    throw new Error(`[Schema] ${path}.default must be finite.`);
  }
}

function validateMidiOut(schema: MidiOutSchema, path: string) {
  if (
    !Number.isInteger(schema.channel) ||
    schema.channel < 1 ||
    schema.channel > 16
  ) {
    throw new Error(`[Schema] ${path}.channel must be an integer in [1, 16].`);
  }
  if (schema.device !== undefined && !isNonEmptyString(schema.device)) {
    throw new Error(`[Schema] ${path}.device must be non-empty when provided.`);
  }
}

function validateFit(schema: FitSchema | null, path: string) {
  if (schema === null) return;
  if (
    schema.type !== "fit" ||
    !Number.isInteger(schema.bars) ||
    schema.bars <= 0
  ) {
    throw new Error(`[Schema] ${path}.bars must be a positive integer.`);
  }
}

function validateRegion(schema: RegionSchema | null, path: string) {
  if (schema === null) return;
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
    if (schema.slices.length === 0) {
      throw new Error(
        `[Schema] ${path}.slices must contain at least one slice.`,
      );
    }
    schema.slices.forEach((slice, index) => {
      if (
        !Number.isFinite(slice.start) ||
        !Number.isFinite(slice.end) ||
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

function isCanonicalName(name: string) {
  return name !== "" && name === name.trim();
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isFiniteNumericString(value: string) {
  return value.trim() !== "" && Number.isFinite(Number(value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveInteger(value: number | undefined) {
  return value !== undefined && Number.isInteger(value) && value > 0;
}

function isAlgorithm(value: string): value is "xor" | "mulberry" {
  return value === "xor" || value === "mulberry";
}

function isOrder(value: string): value is "forward" | "reverse" {
  return value === "forward" || value === "reverse";
}

function isDataType(value: string): value is "float" | "integer" | "binary" {
  return value === "float" || value === "integer" || value === "binary";
}

function isWaveform(
  value: string,
): value is "sine" | "square" | "sawtooth" | "triangle" {
  return (
    value === "sine" ||
    value === "square" ||
    value === "sawtooth" ||
    value === "triangle"
  );
}

function isFilterType(value: string) {
  return ["lp", "hp", "bp", "notch", "ap", "pk", "ls", "hs"].includes(value);
}

function isClipMode(value: string) {
  return value === "clipped" || value === "one-shot";
}

function isSampleDirection(value: string) {
  return value === "forward" || value === "reverse" || value === "alternate";
}

export { validateDromeGraph };
