import type { EnvelopeSchema } from "@web-audio/schema";
import { isStructuredInput } from "@web-audio/patterns";
import { isShorthand } from "@/inputs/decode-shorthand-input";
import { isRandomCycle } from "@/inputs/guards";
import type {
  ADSRInput,
  NumericPatternInput,
  NumericPatternValue,
  ShorthandInput,
} from "@/inputs/types";
import Parameter, {
  createParameter,
  createParameterValue,
} from "@/parameters/parameter";

type ADSR = { a: number; d: number; s: number; r: number };
export type EnvelopeArguments =
  | [maximum?: NumericPatternValue]
  | [minimum: NumericPatternValue, ...maximum: NumericPatternInput];

class Envelope {
  private _min: Parameter;
  private _max: Parameter;
  private _a: Parameter;
  private _d: Parameter;
  private _s: Parameter;
  private _r: Parameter;
  private _mode: EnvelopeSchema["mode"];

  constructor(...args: EnvelopeArguments) {
    const [minOrMax, ...max] = args;

    if (args.length <= 1) {
      if (minOrMax === null) {
        throw new TypeError("[Envelope] maximum cannot be null.");
      }
      if (minOrMax === undefined) {
        this._min = new Parameter(0);
        this._max = new Parameter(1);
      } else {
        assertEnvelopePatternValue(minOrMax, "maximum");
        this._min = new Parameter(0);
        this._max = createEnvelopeParameter(
          minOrMax,
          "[Envelope] constructor max",
        );
      }
    } else {
      if (minOrMax === null) {
        throw new TypeError("[Envelope] minimum cannot be null.");
      }
      assertEnvelopePatternValue(minOrMax, "minimum");
      if (max.some((value) => value === null)) {
        throw new TypeError("[Envelope] maximum cannot be null.");
      }
      if (max.some((value) => value === undefined)) {
        throw new TypeError(
          "[Envelope] maximum cannot contain undefined values.",
        );
      }
      this._min = createEnvelopeParameter(
        minOrMax,
        "[Envelope] constructor minimum",
      );
      this._max = createEnvelopeParameter(max, "[Envelope] constructor max");
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
        ? createEnvelopeParameter(input, "[Envelope] max()")
        : new Parameter(1);
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

function assertEnvelopePatternValue(
  value: unknown,
  field: "minimum" | "maximum",
): asserts value is NumericPatternValue {
  if (
    value === null ||
    (typeof value !== "number" &&
      !isShorthandInput(value) &&
      !isRandomCycle(value) &&
      !isStructuredInput(value))
  ) {
    throw new TypeError(
      `[Envelope] ${field} must be a number, shorthand, structured input, or random cycle.`,
    );
  }
}

function createEnvelopeParameter(
  valueOrInput: NumericPatternValue | NumericPatternInput,
  method: string,
) {
  const input = (
    Array.isArray(valueOrInput) ? valueOrInput : [valueOrInput]
  ) as NumericPatternInput;
  const parameter = createParameter(input, method);
  // A direct random source is intentionally left live. Serializing it here
  // would materialize pending configuration and change its authored lifecycle.
  if (!(input.length === 1 && isRandomCycle(input[0]))) {
    try {
      parameter.getSchema();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const field = method.includes("minimum") ? "minimum" : "maximum";
      throw new Error(`${method} ${field} ${message}`, { cause: error });
    }
  }
  return parameter;
}

function isShorthandInput(value: unknown): value is ShorthandInput {
  return typeof value === "string" || isShorthand(value);
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
