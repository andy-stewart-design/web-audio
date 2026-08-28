import type { AudioParamSchema, DromeSchema, EffectSchema } from "./index";

function validateDromeGraph(schema: DromeSchema) {
  for (const [name, bus] of Object.entries(schema.buses)) {
    if (!isCanonicalName(name)) {
      throw new Error(`[Schema] Bus name "${name}" is not canonical.`);
    }
    if (!Number.isFinite(bus.gain) || bus.gain < 0) {
      throw new Error(
        `[Schema] Bus "${name}" gain must be a finite number greater than or equal to 0.`,
      );
    }
    if (name === "main" && bus.effects.length > 0) {
      throw new Error(
        "[Schema] Effects on main are not supported in the bus MVP.",
      );
    }
    validateBusEffects(bus.effects, name);
  }

  schema.instruments.forEach((instrument, index) => {
    if (!isCanonicalName(instrument.route)) {
      throw new Error(
        `[Schema] Instrument ${index} route "${instrument.route}" is not canonical.`,
      );
    }
    if (instrument.route !== "main" && !schema.buses[instrument.route]) {
      throw new Error(
        `[Schema] Instrument ${index} route "${instrument.route}" does not reference a declared bus.`,
      );
    }

    for (const [target, amount] of Object.entries(instrument.sends)) {
      if (!isCanonicalName(target)) {
        throw new Error(
          `[Schema] Instrument ${index} send target "${target}" is not canonical.`,
        );
      }
      if (target === "main") {
        throw new Error(
          `[Schema] Instrument ${index} send cannot target main.`,
        );
      }
      if (!schema.buses[target]) {
        throw new Error(
          `[Schema] Instrument ${index} send "${target}" does not reference a declared bus.`,
        );
      }
      if (!Number.isFinite(amount) || amount < 0 || amount > 1) {
        throw new Error(
          `[Schema] Instrument ${index} send "${target}" amount must be a finite number in [0, 1].`,
        );
      }
    }
  });
}

function isCanonicalName(name: string) {
  return name !== "" && name === name.trim();
}

function validateBusEffects(effects: EffectSchema[], busName: string) {
  effects.forEach((effect, index) => {
    const base = `Bus "${busName}" effects[${index}]`;
    if (effect.type === "filter") {
      validateBusAudioParam(effect.frequency, `${base}.frequency`);
      validateBusAudioParam(effect.q, `${base}.q`);
      validateBusAudioParam(effect.detune, `${base}.detune`);
      validateBusAudioParam(effect.gain, `${base}.gain`);
    } else {
      validateBusAudioParam(effect.gain, `${base}.gain`);
    }
  });
}

function validateBusAudioParam(schema: AudioParamSchema, path: string) {
  if (schema.type === "random") {
    validateRandomBusAudioParam(schema, path);
    return;
  }
  if (
    schema.type !== "static" ||
    schema.cycle.length === 0 ||
    schema.cycle.some(
      (bar) => bar.length === 0 || !Number.isFinite(bar[0].value),
    )
  ) {
    throw new Error(
      `[Schema] ${path} must be a finite bar-resolvable static or random parameter.`,
    );
  }
}

type RandomBusAudioParam = Extract<AudioParamSchema, { type: "random" }>;

function validateRandomBusAudioParam(
  schema: RandomBusAudioParam,
  path: string,
) {
  validateRandomSegments(schema, path);
  validateRandomRange(schema, path);
  validateRandomQuantization(schema, path);
  validateRandomChance(schema, path);
  validateRandomValueMap(schema, path);
  validateRandomGrid(schema, path);
}

function validateRandomSegments(schema: RandomBusAudioParam, path: string) {
  if (schema.segments.length === 0) {
    throw new Error(`[Schema] ${path} random segments cannot be empty.`);
  }
  if (schema.segments.some(({ seed }) => !Number.isFinite(seed))) {
    throw new Error(`[Schema] ${path} random seeds must be finite.`);
  }

  const isUnbounded =
    schema.segments.length === 1 && schema.segments[0].len === undefined;
  if (
    !isUnbounded &&
    schema.segments.some(({ len }) => !isPositiveInteger(len))
  ) {
    throw new Error(
      `[Schema] ${path} random segment lengths must be positive finite integers.`,
    );
  }
}

function validateRandomRange(schema: RandomBusAudioParam, path: string) {
  if (
    schema.range !== undefined &&
    (!Number.isFinite(schema.range.min) ||
      !Number.isFinite(schema.range.max) ||
      !Number.isFinite(schema.range.max - schema.range.min))
  ) {
    throw new Error(
      `[Schema] ${path} random range endpoints and span must be finite.`,
    );
  }
}

function validateRandomQuantization(schema: RandomBusAudioParam, path: string) {
  if (
    schema.quantValue !== undefined &&
    (!Number.isFinite(schema.quantValue) || schema.quantValue <= 0)
  ) {
    throw new Error(
      `[Schema] ${path} random quantization must be a positive finite number.`,
    );
  }
}

function validateRandomChance(schema: RandomBusAudioParam, path: string) {
  if (
    schema.chance !== undefined &&
    (schema.dataType !== "binary" ||
      !Number.isFinite(schema.chance) ||
      schema.chance < 0 ||
      schema.chance > 1)
  ) {
    throw new Error(
      `[Schema] ${path} random chance must be a finite number in [0, 1] on a binary parameter.`,
    );
  }
}

function validateRandomValueMap(schema: RandomBusAudioParam, path: string) {
  if (
    schema.valueMap !== undefined &&
    (schema.valueMap.length === 0 ||
      schema.valueMap.some((value) => !Number.isFinite(value)) ||
      (schema.dataType === "binary" && schema.valueMap.length < 2))
  ) {
    throw new Error(
      `[Schema] ${path} random value map must contain finite, safely indexable values.`,
    );
  }
}

function validateRandomGrid(schema: RandomBusAudioParam, path: string) {
  if (
    schema.grid.cycle.length === 0 ||
    schema.grid.cycle.some(
      (bar) => bar.length === 0 || !Number.isFinite(bar[0].value),
    )
  ) {
    throw new Error(
      `[Schema] ${path} random grid must have a finite first value in every bar.`,
    );
  }
}

function isPositiveInteger(value: number | undefined) {
  return value !== undefined && Number.isInteger(value) && value > 0;
}

export { validateDromeGraph };
