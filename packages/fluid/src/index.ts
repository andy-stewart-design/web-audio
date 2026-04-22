import { RandomCycle } from "@web-audio/patterns";
import Envelope from "./automations/envelope";
import Filter from "./effects/filter";
import Synthesizer from "./instruments/synthesizer";
import type { CycleInput, DromeSchema, Waveform } from "./types";
import type { FilterType } from "@web-audio/schema";

class Drome {
  private _instruments: Set<Synthesizer>;

  constructor() {
    this._instruments = new Set();
  }

  synth(type?: Waveform) {
    return new Synthesizer({ host: this, type });
  }

  rand() {
    return new RandomCycle();
  }

  env(min?: number, ...max: CycleInput) {
    return new Envelope(min, ...max);
  }

  filter(type: FilterType, ...frequency: CycleInput | [Envelope]) {
    return new Filter(type, ...frequency);
  }

  lpf(...frequency: CycleInput | [Envelope]) {
    return new Filter("lp", ...frequency);
  }

  hpf(...frequency: CycleInput | [Envelope]) {
    return new Filter("hp", ...frequency);
  }

  bpf(...frequency: CycleInput | [Envelope]) {
    return new Filter("bp", ...frequency);
  }

  push(inst: Synthesizer) {
    this._instruments.add(inst);
  }

  getSchema(): DromeSchema {
    return {
      instruments: Array.from(this._instruments).map((i) => i.getSchema()),
    };
  }
}

export default Drome;
