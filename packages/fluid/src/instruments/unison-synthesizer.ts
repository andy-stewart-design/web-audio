import type { UnisonSynthesizerSchema } from "@web-audio/schema";
import type Drome from "@/drome";
import Parameter, {
  type AudioParamInput,
  type AudioParamSource,
} from "@/parameters/parameter";
import type { CycleInput } from "@/inputs/types";
import {
  resolveUnisonWaveform,
  type UnisonWaveformAlias,
} from "@/inputs/waveform";
import SynthBase from "./synth-base";

interface UnisonSynthesizerOptions {
  host?: Drome;
}

class UnisonSynthesizer extends SynthBase {
  private _waveform: "sawtooth";
  private _voices = new Parameter(7);
  private _spread: AudioParamSource = new Parameter(10);
  private _width: AudioParamSource = new Parameter(0.4);

  constructor({ host }: UnisonSynthesizerOptions = {}) {
    super(host);
    this._waveform = resolveUnisonWaveform("saw");
  }

  type(shape: UnisonWaveformAlias) {
    this._waveform = resolveUnisonWaveform(shape);
    return this;
  }

  voices(...input: CycleInput<number>) {
    this._voices = new Parameter(...input);
    return this;
  }

  spread(...input: AudioParamInput) {
    this._spread = this._resolveAudioParam(input);
    return this;
  }

  width(...input: AudioParamInput) {
    this._width = this._resolveAudioParam(input);
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
