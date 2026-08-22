import type {
  AudioParamSchema,
  DromeSchema,
  EffectSchema,
  StaticSchema,
} from "./index";

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
      validateConstantBusAudioParam(effect.frequency, `${base}.frequency`);
      validateConstantBusAudioParam(effect.q, `${base}.q`);
      validateConstantBusAudioParam(effect.detune, `${base}.detune`);
      validateConstantBusAudioParam(effect.gain, `${base}.gain`);
    } else {
      validateConstantBusAudioParam(effect.gain, `${base}.gain`);
    }
  });
}

function validateConstantBusAudioParam(schema: AudioParamSchema, path: string) {
  if (!isConstantAudioParamSchema(schema)) {
    throw new Error(
      `[Schema] ${path} must be one finite constant static value.`,
    );
  }
}

function isConstantAudioParamSchema(
  schema: AudioParamSchema,
): schema is StaticSchema {
  return (
    schema.type === "static" &&
    schema.cycle.length === 1 &&
    schema.cycle[0]?.length === 1 &&
    Number.isFinite(schema.cycle[0][0].value)
  );
}

export { isConstantAudioParamSchema, validateDromeGraph };
