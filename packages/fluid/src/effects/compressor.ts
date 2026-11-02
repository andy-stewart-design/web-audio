import type { CompressorEffectSchema } from "@web-audio/schema";
import type { SingleSlotAudioParamInput } from "@/inputs/types";
import Parameter, {
  type AudioParamInput,
  type AudioParamSource,
} from "@/parameters/parameter";
import {
  resolveAudioParam,
  resolveAudioParamValue,
} from "@/parameters/resolve-audio-param";

/** Native compressor controls use dB, unitless ratio, and seconds for timing. */
class Compressor {
  private _threshold: AudioParamSource;
  private _ratio: AudioParamSource;
  private _knee: AudioParamSource;
  private _attack: AudioParamSource;
  private _release: AudioParamSource;
  thr: (...input: AudioParamInput) => this;
  rat: (...input: AudioParamInput) => this;
  a: (...input: AudioParamInput) => this;
  r: (...input: AudioParamInput) => this;

  constructor(
    threshold?: SingleSlotAudioParamInput,
    ratio?: SingleSlotAudioParamInput,
  ) {
    if (arguments.length > 2) {
      throw new TypeError(
        "[Compressor] accepts at most two threshold and ratio values.",
      );
    }
    this._threshold =
      threshold === undefined
        ? new Parameter(-24)
        : resolveAudioParamValue(threshold, "[Compressor] threshold()");
    this._ratio =
      ratio === undefined
        ? new Parameter(12)
        : resolveAudioParamValue(ratio, "[Compressor] ratio()");
    this._knee = new Parameter(30);
    this._attack = new Parameter(0.003);
    this._release = new Parameter(0.25);
    this.thr = this.threshold.bind(this);
    this.rat = this.ratio.bind(this);
    this.a = this.attack.bind(this);
    this.r = this.release.bind(this);
  }

  threshold(...input: AudioParamInput) {
    this._threshold = resolveAudioParam(input, "[Compressor] threshold()");
    return this;
  }

  ratio(...input: AudioParamInput) {
    this._ratio = resolveAudioParam(input, "[Compressor] ratio()");
    return this;
  }

  knee(...input: AudioParamInput) {
    this._knee = resolveAudioParam(input, "[Compressor] knee()");
    return this;
  }

  attack(...input: AudioParamInput) {
    this._attack = resolveAudioParam(input, "[Compressor] attack()");
    return this;
  }

  release(...input: AudioParamInput) {
    this._release = resolveAudioParam(input, "[Compressor] release()");
    return this;
  }

  getSchema(): CompressorEffectSchema {
    return {
      type: "compressor",
      threshold: this._threshold.getSchema(),
      ratio: this._ratio.getSchema(),
      knee: this._knee.getSchema(),
      attack: this._attack.getSchema(),
      release: this._release.getSchema(),
    };
  }
}

export default Compressor;
