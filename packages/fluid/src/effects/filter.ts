import type { FilterSchema, FilterType } from "@web-audio/schema";
import Parameter from "@/patterns/parameter";
import { isEnvelopeTuple, isLfoTuple, isMidiCcTuple } from "@/utils/validate";
import type { AudioParamInput, AudioParamSource } from "@/types";

class Filter {
  private _filterType: FilterType;
  private _frequency: AudioParamSource;
  private _q: AudioParamSource | undefined;
  private _detune: AudioParamSource | undefined;
  private _gain: AudioParamSource | undefined;

  constructor(type: FilterType, ...frequency: AudioParamInput) {
    this._filterType = type;
    if (isLfoTuple(frequency)) {
      this._frequency = frequency[0];
    } else if (isEnvelopeTuple(frequency)) {
      this._frequency = frequency[0];
    } else if (isMidiCcTuple(frequency)) {
      this._frequency = frequency[0];
    } else {
      this._frequency = new Parameter(...frequency);
    }
  }

  q(...input: AudioParamInput) {
    if (isLfoTuple(input)) {
      this._q = input[0];
    } else if (isEnvelopeTuple(input)) {
      this._q = input[0];
    } else if (isMidiCcTuple(input)) {
      this._q = input[0];
    } else {
      this._q = new Parameter(...input);
    }
    return this;
  }

  detune(...input: AudioParamInput) {
    if (isLfoTuple(input)) {
      this._detune = input[0];
    } else if (isEnvelopeTuple(input)) {
      this._detune = input[0];
    } else if (isMidiCcTuple(input)) {
      this._detune = input[0];
    } else {
      this._detune = new Parameter(...input);
    }
    return this;
  }

  gain(...input: AudioParamInput) {
    if (isLfoTuple(input)) {
      this._gain = input[0];
    } else if (isEnvelopeTuple(input)) {
      this._gain = input[0];
    } else if (isMidiCcTuple(input)) {
      this._gain = input[0];
    } else {
      this._gain = new Parameter(...input);
    }
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
