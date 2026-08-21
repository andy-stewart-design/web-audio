import type { AudioParamSchema, EffectSchema } from "@web-audio/schema";

function validateBusEffects(effects: EffectSchema[], busName: string) {
  effects.forEach((effect, index) => {
    const base = `"${busName}".effects[${index}]`;
    if (effect.type === "filter") {
      validateParameter(effect.frequency, `${base}.frequency`);
      validateParameter(effect.q, `${base}.q`);
      validateParameter(effect.detune, `${base}.detune`);
      validateParameter(effect.gain, `${base}.gain`);
    } else {
      validateParameter(effect.gain, `${base}.gain`);
    }
  });
}

function validateParameter(schema: AudioParamSchema, path: string) {
  if (
    schema.type !== "static" ||
    schema.cycle.length !== 1 ||
    schema.cycle[0]?.length !== 1 ||
    !Number.isFinite(schema.cycle[0][0].value)
  ) {
    throw new Error(`[Bus] ${path} must be one finite constant static value.`);
  }
}

export { validateBusEffects };
