import type { AudioParamSchema, EffectSchema } from "@web-audio/schema";

function resolveConstantAudioParam(schema: AudioParamSchema, path: string) {
  if (
    schema.type !== "static" ||
    schema.cycle.length !== 1 ||
    schema.cycle[0]?.length !== 1 ||
    !Number.isFinite(schema.cycle[0][0].value)
  ) {
    throw new Error(
      `[AudioEngine] ${path} must be one finite constant static value.`,
    );
  }
  return schema.cycle[0][0].value;
}

function validateConstantBusEffects(effects: EffectSchema[], busName: string) {
  effects.forEach((effect, index) => {
    const base = `Bus "${busName}" effects[${index}]`;
    if (effect.type === "filter") {
      resolveConstantAudioParam(effect.frequency, `${base}.frequency`);
      resolveConstantAudioParam(effect.q, `${base}.q`);
      resolveConstantAudioParam(effect.detune, `${base}.detune`);
      resolveConstantAudioParam(effect.gain, `${base}.gain`);
    } else {
      resolveConstantAudioParam(effect.gain, `${base}.gain`);
    }
  });
}

export { resolveConstantAudioParam, validateConstantBusEffects };
