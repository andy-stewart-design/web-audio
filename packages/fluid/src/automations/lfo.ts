import { RandomCycle } from "@web-audio/patterns";
import type { LfoSchema, Waveform } from "@web-audio/schema";
import { createParameter } from "@/parameters/parameter";
import type Parameter from "@/parameters/parameter";
import type { ShorthandInput } from "@/inputs/types";
import { isShorthand } from "@/inputs/decode-shorthand-input";
import { resolveWaveform, type WaveformAlias } from "@/inputs/waveform";

type LfoInput = number | number[] | RandomCycle | ShorthandInput;

class Lfo {
  private _id: string;
  private _outputA: Parameter;
  private _outputB: Parameter;
  private _speed: number[];
  private _waveform: Waveform[];
  private _phase: number;
  private _norm: boolean;
  private _invert: boolean;
  private _warnedOutputA = false;
  private _warnedOutputB = false;

  inv: () => this;
  norm: () => this;
  off: (n: number) => this;

  constructor(outputA: LfoInput, outputB: LfoInput) {
    this._id = crypto.randomUUID();
    this._outputA = Lfo._toParameter(outputA, "[LFO] outputA");
    this._outputB = Lfo._toParameter(outputB, "[LFO] outputB");
    this._speed = [1];
    this._waveform = ["sine"];
    this._phase = 0;
    this._norm = false;
    this._invert = false;
    this.inv = this.invert.bind(this);
    this.norm = this.normalize.bind(this);
    this.off = this.offset.bind(this);
  }

  speed(...n: number[]) {
    this._speed = n;
    return this;
  }

  wave(...type: WaveformAlias[]) {
    this._waveform = type.map(resolveWaveform);
    return this;
  }

  offset(n: number) {
    this._phase = n;
    return this;
  }

  normalize() {
    this._norm = true;
    return this;
  }

  invert() {
    this._invert = true;
    return this;
  }

  getSchema(): LfoSchema {
    const outputA = this._outputA.getSchema();
    const outputB = this._outputB.getSchema();
    this._warnForIgnoredValues(outputA, "A");
    this._warnForIgnoredValues(outputB, "B");

    return {
      type: "lfo",
      id: this._id,
      outputA,
      outputB,
      speed: this._speed,
      waveform: this._waveform,
      phase: this._phase,
      norm: this._norm,
      invert: this._invert,
    };
  }

  private _warnForIgnoredValues(
    schema: LfoSchema["outputA"],
    endpoint: "A" | "B",
  ) {
    const alreadyWarned =
      endpoint === "A" ? this._warnedOutputA : this._warnedOutputB;
    if (alreadyWarned || schema.type !== "static") return;
    if (!schema.cycle.some((bar) => bar.length > 1)) return;

    console.warn(
      `[LFO] output${endpoint} bars contain multiple values; only the first value of each bar is used.`,
    );
    if (endpoint === "A") this._warnedOutputA = true;
    else this._warnedOutputB = true;
  }

  private static _toParameter(input: LfoInput, method: string): Parameter {
    if (input instanceof RandomCycle) return createParameter([input], method);
    if (Array.isArray(input)) {
      if (
        input.some((value) => typeof value === "string" || isShorthand(value))
      ) {
        throw new Error(`${method} shorthand input must be a whole endpoint.`);
      }
      return createParameter(input, method);
    }
    if (typeof input === "number") return createParameter([input], method);
    if (typeof input === "string") return createParameter([input], method);
    return createParameter([input], method);
  }
}

export default Lfo;
export type { LfoInput };
