import type { FilterSchema, FilterType } from "@web-audio/schema";
import Parameter, {
  type AudioParamInput,
  type AudioParamSource,
} from "@/parameters/parameter";
import { resolveAudioParam } from "@/parameters/resolve-audio-param";

class Filter {
  private _filterType: FilterType;
  private _frequency: AudioParamSource;
  private _q: AudioParamSource | undefined;
  private _detune: AudioParamSource | undefined;
  private _gain: AudioParamSource | undefined;

  constructor(type: FilterType, ...frequency: AudioParamInput) {
    this._filterType = type;
    this._frequency = resolveAudioParam(frequency, "[Filter] frequency()");
  }

  q(...input: AudioParamInput) {
    this._q = resolveAudioParam(input, "[Filter] q()");
    return this;
  }

  detune(...input: AudioParamInput) {
    this._detune = resolveAudioParam(input, "[Filter] detune()");
    return this;
  }

  gain(...input: AudioParamInput) {
    this._gain = resolveAudioParam(input, "[Filter] gain()");
    return this;
  }

  getSchema(): FilterSchema {
    return {
      type: "filter",
      filterType: this._filterType,
      frequency: this._frequency.getSchema("frequency"),
      q: (this._q ?? new Parameter(1)).getSchema("q"),
      detune: (this._detune ?? new Parameter(0)).getSchema("detune"),
      gain: (this._gain ?? new Parameter(0)).getSchema("filterGain"),
    };
  }
}

export default Filter;
