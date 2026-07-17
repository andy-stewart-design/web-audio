import type { GainEffectSchema } from "@web-audio/schema";
import Envelope from "@/automations/envelope";
import Lfo from "@/automations/lfo";
import Parameter from "@/patterns/parameter";
import { MidiCc } from "@/midi";
import type { AudioParamSource } from "@/types";

class GainEffect {
  private _gain: AudioParamSource;

  constructor(input: number | Envelope | Lfo | MidiCc) {
    if (
      input instanceof Envelope ||
      input instanceof Lfo ||
      input instanceof MidiCc
    ) {
      this._gain = input;
    } else {
      this._gain = new Parameter(input);
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
