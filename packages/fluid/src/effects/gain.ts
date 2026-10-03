import type { GainEffectSchema } from "@web-audio/schema";
import Parameter, {
  type AudioParamInput,
  type AudioParamSource,
} from "@/parameters/parameter";
import { isEnvelopeTuple, isLfoTuple, isMidiCcTuple } from "@/inputs/guards";

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
