import type { UnisonSynthesizerSchema } from "@web-audio/schema";
import type Drome from "@/drome";
import Parameter, {
  createParameter,
  type AudioParamInput,
  type AudioParamSource,
} from "@/parameters/parameter";
import { resolveAudioParam } from "@/parameters/resolve-audio-param";
import type { NumericPatternInput } from "@/inputs/types";
import {
  resolveUnisonWaveform,
  type UnisonWaveformAlias,
} from "@/inputs/waveform";
import SynthBase from "./synth-base";

interface UnisonSynthesizerOptions {
  host?: Drome;
  sourceGain?: AudioParamSource;
}

class UnisonSynthesizer extends SynthBase {
  private _waveform: "sawtooth";
  private _voices = new Parameter(7);
  private _spread: AudioParamSource = new Parameter(10);
  private _width: AudioParamSource = new Parameter(0.4);

  constructor({ host, sourceGain }: UnisonSynthesizerOptions = {}) {
    super(host, sourceGain);
    this._waveform = resolveUnisonWaveform("saw");
  }

  type(shape: UnisonWaveformAlias) {
    this._waveform = resolveUnisonWaveform(shape);
    return this;
  }

  voices(...input: NumericPatternInput) {
    this._voices = createParameter(input, "[Unison] voices()");
    return this;
  }

  spread(...input: AudioParamInput) {
    this._spread = resolveAudioParam(input, "[Unison] spread()");
    return this;
  }

  width(...input: AudioParamInput) {
    this._width = resolveAudioParam(input, "[Unison] width()");
    return this;
  }

  getSchema(): UnisonSynthesizerSchema {
    return {
      ...this._getSynthSchema(),
      engine: "unison",
      waveform: this._waveform,
      voices: this._voices.getSchema(),
      spread: this._getAudioParamSchema(this._spread, "spread"),
      width: this._getAudioParamSchema(this._width, "width"),
    };
  }
}

export default UnisonSynthesizer;
