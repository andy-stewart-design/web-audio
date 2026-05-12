import type { GainEffectSchema } from "@web-audio/schema";
import Envelope from "@/automations/envelope";
import Lfo from "@/automations/lfo";
import Parameter from "@/patterns/parameter";

class GainEffect {
  private _gain: Parameter | Envelope | Lfo;

  constructor(input: number | Envelope | Lfo) {
    if (input instanceof Envelope || input instanceof Lfo) {
      this._gain = input;
    } else {
      this._gain = new Parameter(input);
    }
  }

  getSchema(): GainEffectSchema {
    return {
      type: "gain",
      gain: this._gain.getSchema(),
    };
  }
}

export default GainEffect;
