import type { SynthesizerSchema, Waveform } from "@web-audio/schema";
import Instrument from "./instrument";
import type Drome from "@/index";
import { resolveWaveform, type WaveformAlias } from "@/utils/waveform";

interface SynthesizerOptions {
  type?: WaveformAlias;
  host?: Drome;
}

class Synthesizer extends Instrument {
  private _type: Waveform;

  constructor({ type = "sine", host }: SynthesizerOptions = {}) {
    super([60], host, { a: 0.005, r: 0.005 });
    this._type = resolveWaveform(type);
  }

  type(t: WaveformAlias) {
    this._type = resolveWaveform(t);
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
