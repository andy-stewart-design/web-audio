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
      validateStaticBusAudioParam(effect.frequency, `${base}.frequency`);
      validateStaticBusAudioParam(effect.q, `${base}.q`);
      validateStaticBusAudioParam(effect.detune, `${base}.detune`);
      validateStaticBusAudioParam(effect.gain, `${base}.gain`);
    } else {
      validateStaticBusAudioParam(effect.gain, `${base}.gain`);
    }
  });
}

function validateStaticBusAudioParam(schema: AudioParamSchema, path: string) {
  if (
    schema.type !== "static" ||
    schema.cycle.length === 0 ||
    schema.cycle.some(
      (bar) => bar.length === 0 || !Number.isFinite(bar[0].value),
    )
  ) {
    throw new Error(
      `[Schema] ${path} must be a finite bar-resolvable static parameter.`,
    );
  }
}

export { validateDromeGraph };
