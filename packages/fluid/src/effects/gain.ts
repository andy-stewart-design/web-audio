import type { GainEffectSchema } from "@web-audio/schema";
import {
  type AudioParamInput,
  type AudioParamSource,
} from "@/parameters/parameter";
import { resolveAudioParam } from "@/parameters/resolve-audio-param";

class GainEffect {
  private _gain: AudioParamSource;

  constructor(...input: AudioParamInput) {
    this._gain = resolveAudioParam(input, "[GainEffect] gain()");
  }

  getSchema(): GainEffectSchema {
    return {
      type: "gain",
      gain: this._gain.getSchema("gain"),
    };
  }
}

export default GainEffect;
