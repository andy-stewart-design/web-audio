import { RandomCycle } from "@web-audio/patterns";
import Synthesizer from "./instruments/synthesizer";
import type { DromeSchema, Waveform } from "./types";

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
