import Synthesizer from "./instruments/synthesizer";
import type { SynthesizerSchema, Waveform } from "./types";

class Drome {
  private _instruments: Set<Synthesizer>;

  constructor() {
    this._instruments = new Set();
  }

  synth(type?: Waveform) {
    return new Synthesizer({ host: this, type });
  }

  push(inst: Synthesizer) {
    this._instruments.add(inst);
  }

  getSchema() {
    return {
      instruments: Array.from(this._instruments).map((i) => i.getSchema()),
    };
  }
}

export { Drome, Synthesizer, Synthesizer as Synth, type SynthesizerSchema };
