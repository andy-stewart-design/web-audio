import type { EnvelopeSchema } from "@web-audio/schema";
import { isShorthand } from "@/inputs/decode-shorthand-input";
import type {
  ADSRInput,
  NumericPatternInput,
  ShorthandInput,
} from "@/inputs/types";
import Parameter, { createParameter } from "@/parameters/parameter";

type ADSR = { a: number; d: number; s: number; r: number };

class Envelope {
  private _min: number;
  private _max: Parameter;
  private _a: Parameter;
  private _d: Parameter;
  private _s: Parameter;
  private _r: Parameter;
  private _mode: EnvelopeSchema["mode"];

  constructor(max: ShorthandInput);
  constructor(min?: number, ...max: NumericPatternInput);
  constructor(minOrMax?: number | ShorthandInput, ...max: NumericPatternInput) {
    if (isShorthandInput(minOrMax)) {
      if (max.length > 0) {
        throw new Error(
          "[Envelope] shorthand maximum must be the sole argument.",
        );
      }
      this._min = 0;
      this._max = createParameter([minOrMax], "[Envelope] constructor max");
    } else {
      this._min = minOrMax ?? 0;
      this._max =
        max.length > 0
          ? createParameter(max, "[Envelope] constructor max")
          : new Parameter(1);
    }
    this._a = new Parameter(0.01);
    this._d = new Parameter(0);
    this._s = new Parameter(1);
    this._r = new Parameter(0.01);
    this._mode = "bleed";
  }

  max(...input: NumericPatternInput) {
    this._max =
      input.length > 0
        ? createParameter(input, "[Envelope] max()")
        : new Parameter(1);
    return this;
  }

  adsr(a: ADSRInput, d: ADSRInput, s: ADSRInput, r: ADSRInput) {
    const nextA = createAdsrParameter(a, "[Envelope] adsr() a");
    const nextD = createAdsrParameter(d, "[Envelope] adsr() d");
    const nextS = createAdsrParameter(s, "[Envelope] adsr() s");
    const nextR = createAdsrParameter(r, "[Envelope] adsr() r");
    this._a = nextA;
    this._d = nextD;
    this._s = nextS;
    this._r = nextR;
    return this;
  }

  a(...input: NumericPatternInput) {
    this._a = createParameter(input, "[Envelope] a()");
    return this;
  }

  d(...input: NumericPatternInput) {
    this._d = createParameter(input, "[Envelope] d()");
    return this;
  }

  s(...input: NumericPatternInput) {
    this._s = createParameter(input, "[Envelope] s()");
    return this;
  }

  r(...input: NumericPatternInput) {
    this._r = createParameter(input, "[Envelope] r()");
    return this;
  }

  mode(m: EnvelopeSchema["mode"]) {
    this._mode = m;
    return this;
  }

  getSchema(): EnvelopeSchema {
    return {
      type: "envelope",
      min: this._min,
      max: this._max.getSchema(),
      a: this._a.getSchema(),
      d: this._d.getSchema(),
      s: this._s.getSchema(),
      r: this._r.getSchema(),
      mode: this._mode,
    };
  }
}

function isShorthandInput(value: unknown): value is ShorthandInput {
  return typeof value === "string" || isShorthand(value);
}

function createAdsrParameter(input: ADSRInput, method: string) {
  if (Array.isArray(input)) {
    throw new Error(`${method} positional arrays are not supported.`);
  }
  if (isShorthandInput(input)) {
    return createParameter([input], method);
  }
  return createParameter([input], method);
}

export default Envelope;
export type { ADSR };
