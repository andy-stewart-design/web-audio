import type { EnvelopeSchema } from "@web-audio/schema";
import Parameter from "@/patterns/parameter";
import type { CycleInput } from "@/types";

class Envelope {
  private _min: number;
  private _max: Parameter;
  private _a: Parameter;
  private _d: Parameter;
  private _s: Parameter;
  private _r: Parameter;
  private _mode: "bleed" | "clip";

  constructor(min?: number, ...max: CycleInput) {
    this._min = min ?? 0;
    this._max = max.length > 0 ? new Parameter(...max) : new Parameter(1);
    this._a = new Parameter(0.01);
    this._d = new Parameter(0);
    this._s = new Parameter(1);
    this._r = new Parameter(0.01);
    this._mode = "bleed";
  }

  adsr(
    a: number | number[],
    d: number | number[],
    s: number | number[],
    r: number | number[],
  ) {
    this._a = new Parameter(a);
    this._d = new Parameter(d);
    this._s = new Parameter(s);
    this._r = new Parameter(r);
    return this;
  }

  a(...input: CycleInput) {
    this._a = new Parameter(...input);
    return this;
  }

  d(...input: CycleInput) {
    this._d = new Parameter(...input);
    return this;
  }

  s(...input: CycleInput) {
    this._s = new Parameter(...input);
    return this;
  }

  r(...input: CycleInput) {
    this._r = new Parameter(...input);
    return this;
  }

  mode(m: "bleed" | "clip") {
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

export default Envelope;
