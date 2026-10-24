import type { FilterSchema, FilterType } from "@web-audio/schema";
import Parameter, {
  type AudioParamInput,
  type AudioParamSource,
} from "@/parameters/parameter";
import {
  resolveAudioParam,
  resolveAudioParamValue,
} from "@/parameters/resolve-audio-param";
import type { SingleSlotAudioParamInput } from "@/inputs/types";

class Filter {
  private _filterType: FilterType;
  private _frequency: AudioParamSource;
  private _q: AudioParamSource | undefined;
  private _detune: AudioParamSource | undefined;
  private _gain: AudioParamSource | undefined;

  constructor(type: FilterType, frequency: SingleSlotAudioParamInput) {
    if (type === undefined) {
      throw new TypeError("[Filter] filter type is required.");
    }
    if (arguments.length < 2) {
      throw new TypeError("[Filter] frequency is required.");
    }
    if (arguments.length > 2) {
      throw new TypeError("[Filter] accepts one frequency value.");
    }
    this._filterType = type;
    this._frequency = resolveAudioParamValue(frequency, "[Filter] frequency()");
  }

  static fromVariadicFrequency(type: FilterType, frequency: AudioParamInput) {
    const filter = new Filter(type, 0);
    filter._frequency = resolveAudioParam(frequency, "[Filter] frequency()");
    return filter;
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
