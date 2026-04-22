import type { SynthesizerSchema } from "@web-audio/schema";
import Instrument from "./instrument";
import type Drome from "@/index";
import type { Waveform } from "@/types";

interface SynthesizerOptions {
  type?: Waveform;
  host?: Drome;
}

class Synthesizer extends Instrument {
  private _host: Drome | undefined;
  private _type: Waveform;

  constructor({ type = "sine", host }: SynthesizerOptions = {}) {
    super([60]);
    this._type = type;
    this._host = host;
  }

  type(t: Waveform) {
    this._type = t;
    return this;
  }

  push() {
    this._host?.push(this);
    return this;
  }

  getSchema(): SynthesizerSchema {
    return {
      type: "synthesizer" as const,
      waveform: this._type,
      notes: this._cycle.getSchema(),
      detune: this._detune.getSchema(),
      gain: this._gain.getSchema(),
      effects: this._effects.map((e) => e.getSchema()),
    };
  }
}

export default Synthesizer;
