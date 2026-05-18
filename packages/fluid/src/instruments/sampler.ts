import SampleNotes from "@/patterns/sample-notes";
import Parameter from "@/patterns/parameter";
import type { CycleInput } from "@/types";
import type { FitSchema, SamplerSchema } from "@web-audio/schema";
import { DEFAULT_BANK } from "@/banks";
import Instrument from "./instrument";
import type Drome from "@/index";

interface SamplerOptions {
  bank?: string;
  host?: Drome;
}

class Sampler extends Instrument {
  private _host: Drome | undefined;
  private _bank: string;
  private _sample: string;
  private _variation: Parameter;
  private _fit: FitSchema | null = null;
  private _loop = false;

  constructor(sample: string, { bank = DEFAULT_BANK, host }: SamplerOptions = {}) {
    super([0]);
    this._cycle = new SampleNotes([0]);
    this._bank = bank;
    this._sample = sample;
    this._variation = new Parameter(0);
    this._host = host;
  }

  bank(name: string) {
    this._bank = name;
    return this;
  }

  variation(...input: CycleInput) {
    this._variation = new Parameter(...input);
    return this;
  }

  fit(bars: number) {
    this._fit = { type: "fit", bars };
    return this;
  }

  notes(...input: Parameters<Instrument["notes"]>) {
    this._fit = null;
    return super.notes(...input);
  }

  loop(enabled = true) {
    this._loop = enabled;
    return this;
  }

  push() {
    this._host?.push(this);
    return this;
  }

  getSchema(): SamplerSchema {
    return {
      type: "sampler",
      bank: this._bank,
      sample: this._sample,
      variation: this._variation.getSchema(),
      notes: this._fit ?? this._cycle.getSchema(),
      detune: this._detune.getSchema(),
      gain: this._gain.getSchema(),
      effects: this._effects.map((e) => e.getSchema()),
      loop: this._loop,
    };
  }
}

export default Sampler;
