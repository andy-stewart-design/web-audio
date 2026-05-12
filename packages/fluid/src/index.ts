import { RandomCycle } from "@web-audio/patterns";
import Envelope from "./automations/envelope";
import Lfo, { type LfoInput } from "./automations/lfo";
import Filter from "./effects/filter";
import GainEffect from "./effects/gain";
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

  lfo(outputA: LfoInput, outputB: LfoInput) {
    return new Lfo(outputA, outputB);
  }

  gain(input: number | Envelope | Lfo) {
    return new GainEffect(input);
  }

  filter(type: FilterType, ...frequency: CycleInput | [Envelope] | [Lfo]) {
    return new Filter(type, ...frequency);
  }

  lpf(...frequency: CycleInput | [Envelope] | [Lfo]) {
    return new Filter("lp", ...frequency);
  }

  hpf(...frequency: CycleInput | [Envelope] | [Lfo]) {
    return new Filter("hp", ...frequency);
  }

  bpf(...frequency: CycleInput | [Envelope] | [Lfo]) {
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
