import type { GainEffectSchema } from "@web-audio/schema";
import Parameter from "@/patterns/parameter";
import type { AudioParamInput, AudioParamSource } from "@/types";
import { isEnvelopeTuple, isLfoTuple, isMidiCcTuple } from "@/utils/validate";

class GainEffect {
  private _gain: AudioParamSource;

  constructor(...input: AudioParamInput) {
    if (isEnvelopeTuple(input) || isLfoTuple(input) || isMidiCcTuple(input)) {
      this._gain = input[0];
    } else {
      this._gain = new Parameter(...input);
    }
  }

  getSchema(): GainEffectSchema {
    return {
      type: "gain",
      gain: this._gain.getSchema("gain"),
    };
  }
}

export default GainEffect;
