import type { BasicSynthesizerSchema, Waveform } from "@web-audio/schema";
import type Drome from "@/drome";
import SynthBase from "./synth-base";
import { resolveWaveform, type WaveformAlias } from "@/inputs/waveform";

interface SynthesizerOptions {
  type?: WaveformAlias;
  host?: Drome;
}

class Synthesizer extends SynthBase {
  private _type: Waveform;

  constructor({ type = "sine", host }: SynthesizerOptions = {}) {
    super(host);
    this._type = resolveWaveform(type);
  }

  type(t: WaveformAlias) {
    this._type = resolveWaveform(t);
    return this;
  }

  getSchema(): BasicSynthesizerSchema {
    return {
      ...this._getSynthSchema(),
      waveform: this._type,
    };
  }
}

export default Synthesizer;
