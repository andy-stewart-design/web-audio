import type { EnvelopeSchema } from "@web-audio/schema";
import type {
  ADSRInput,
  NumericPatternInput,
  NumericPatternValue,
} from "@/inputs/types";
import { isRandomCycle } from "@/inputs/guards";
import Parameter, {
  createParameter,
  createParameterValue,
} from "@/parameters/parameter";

type ADSR = { a: number; d: number; s: number; r: number };

class Envelope {
  private _min: Parameter;
  private _max: Parameter;
  private _a: Parameter;
  private _d: Parameter;
  private _s: Parameter;
  private _r: Parameter;
  private _mode: EnvelopeSchema["mode"];

  constructor(minOrMax?: NumericPatternValue, maximum?: NumericPatternValue) {
    if (arguments.length > 2) {
      throw new TypeError("[Envelope] constructor accepts at most two values.");
    }

    if (arguments.length < 2) {
      this._min = new Parameter(0);
      this._max = createParameterValue(
        minOrMax === undefined ? 1 : minOrMax,
        "[Envelope] constructor maximum",
      );
    } else {
      if (minOrMax === undefined || maximum === undefined) {
        throw new TypeError(
          "[Envelope] minimum and maximum are required when two bounds are supplied.",
        );
      }
      this._min = createParameterValue(
        minOrMax,
        "[Envelope] constructor minimum",
      );
      this._max = createParameterValue(
        maximum,
        "[Envelope] constructor maximum",
      );
    }

    this._a = new Parameter(0.01);
    this._d = new Parameter(0);
    this._s = new Parameter(1);
    this._r = new Parameter(0.01);
    this._mode = "bleed";
  }

  max(...input: NumericPatternInput) {
    const nextMax =
      input.length > 0
        ? createParameter(input, "[Envelope] max()")
        : new Parameter(1);
    if (input.length > 0 && !(input.length === 1 && isRandomCycle(input[0]))) {
      try {
        nextMax.getSchema();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`[Envelope] max() ${message}`, { cause: error });
      }
    }
    this._max = nextMax;
    return this;
  }

  adsr(a: ADSRInput, d: ADSRInput, s: ADSRInput, r: ADSRInput) {
    if (arguments.length !== 4) {
      throw new TypeError("[Envelope] adsr() requires exactly four values.");
    }

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
      min: getEnvelopeParameterSchema(this._min, "minimum"),
      max: getEnvelopeParameterSchema(this._max, "maximum"),
      a: this._a.getSchema(),
      d: this._d.getSchema(),
      s: this._s.getSchema(),
      r: this._r.getSchema(),
      mode: this._mode,
    };
  }
}

function getEnvelopeParameterSchema(
  parameter: Parameter,
  field: "minimum" | "maximum",
) {
  try {
    return parameter.getSchema();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[Envelope] ${field} ${message}`, { cause: error });
  }
}

function createAdsrParameter(input: ADSRInput, method: string) {
  if (Array.isArray(input)) {
    throw new Error(`${method} positional arrays are not supported.`);
  }
  if (isRandomCycle(input)) {
    throw new Error(`${method} positional random cycles are not supported.`);
  }
  return createParameterValue(input, method);
}

export default Envelope;
export type { ADSR };
