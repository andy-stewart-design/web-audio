import { RandomCycle } from "@web-audio/patterns";
import type { LfoSchema, Waveform } from "@web-audio/schema";
import Parameter from "@/patterns/parameter";
import { resolveWaveform, type WaveformAlias } from "@/utils/waveform";

type LfoInput = number | number[] | RandomCycle;

class Lfo {
  private _id: string;
  private _outputA: Parameter;
  private _outputB: Parameter;
  private _speed: number[];
  private _waveform: Waveform[];
  private _phase: number;
  private _norm: boolean;

  off: (n: number) => this;

  constructor(outputA: LfoInput, outputB: LfoInput) {
    this._id = crypto.randomUUID();
    this._outputA = Lfo._toParameter(outputA);
    this._outputB = Lfo._toParameter(outputB);
    this._speed = [1];
    this._waveform = ["sine"];
    this._phase = 0;
    this._norm = false;
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

  norm() {
    this._norm = true;
    return this;
  }

  getSchema(): LfoSchema {
    return {
      type: "lfo",
      id: this._id,
      outputA: this._outputA.getSchema(),
      outputB: this._outputB.getSchema(),
      speed: this._speed,
      waveform: this._waveform,
      phase: this._phase,
      norm: this._norm,
    };
  }

  private static _toParameter(input: LfoInput): Parameter {
    if (input instanceof RandomCycle) return new Parameter(input);
    if (Array.isArray(input)) return new Parameter(...input);
    return new Parameter(input);
  }
}

export default Lfo;
export type { LfoInput };
