import type { FilterSchema, FilterType } from "@web-audio/schema";
import Envelope from "@/automations/envelope";
import Parameter from "@/patterns/parameter";
import { isEnvelopeTuple } from "@/utils/validate";
import type { CycleInput } from "@/types";

class Filter {
  private _filterType: FilterType;
  private _frequency: Parameter | Envelope;
  private _q: Parameter | Envelope | undefined;
  private _detune: Parameter | Envelope | undefined;
  private _gain: Parameter | Envelope | undefined;

  constructor(type: FilterType, ...frequency: CycleInput | [Envelope]) {
    this._filterType = type;
    if (isEnvelopeTuple(frequency)) {
      this._frequency = frequency[0];
    } else {
      this._frequency = new Parameter(...frequency);
    }
  }

  q(...input: CycleInput | [Envelope]) {
    if (isEnvelopeTuple(input)) {
      this._q = input[0];
    } else {
      this._q = new Parameter(...input);
    }
    return this;
  }

  detune(...input: CycleInput | [Envelope]) {
    if (isEnvelopeTuple(input)) {
      this._detune = input[0];
    } else {
      this._detune = new Parameter(...input);
    }
    return this;
  }

  gain(...input: CycleInput | [Envelope]) {
    if (isEnvelopeTuple(input)) {
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
      frequency: this._frequency.getSchema(),
      q: (this._q ?? new Parameter(1)).getSchema(),
      detune: (this._detune ?? new Parameter(0)).getSchema(),
      gain: (this._gain ?? new Parameter(0)).getSchema(),
    };
  }
}

export default Filter;
