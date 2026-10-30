import type { SaturatorEffectSchema } from "@web-audio/schema";
import type { SingleSlotAudioParamInput } from "@/inputs/types";
import { MidiCc } from "@/midi/builders";
import Parameter, {
  type AudioParamInput,
  type AudioParamSource,
} from "@/parameters/parameter";
import {
  resolveAudioParam,
  resolveAudioParamValue,
} from "@/parameters/resolve-audio-param";

class Saturator {
  private _drive: AudioParamSource;
  private _postgain: AudioParamSource;
  pg: (...input: AudioParamInput) => this;

  constructor(drive?: SingleSlotAudioParamInput) {
    if (arguments.length > 1) {
      throw new TypeError("[Saturator] accepts one drive value.");
    }
    this._drive =
      drive === undefined
        ? new Parameter(1)
        : resolveAudioParamValue(drive, "[Saturator] drive()");
    this._postgain = new Parameter(1);
    this.pg = this.postgain.bind(this);
  }

  postgain(...input: AudioParamInput) {
    if (input.length === 0) {
      throw new TypeError("[Saturator] postgain() requires one value.");
    }
    this._postgain = resolveAudioParam(input, "[Saturator] postgain()");
    return this;
  }

  getSchema(): SaturatorEffectSchema {
    return {
      type: "saturator",
      drive: this._getSchema(this._drive),
      postgain: this._getSchema(this._postgain),
    };
  }

  private _getSchema(source: AudioParamSource) {
    return source instanceof MidiCc
      ? source.getSchema("gain")
      : source.getSchema();
  }
}

export default Saturator;
