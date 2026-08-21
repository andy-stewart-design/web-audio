import type { SynthesizerSchema, Waveform } from "@web-audio/schema";
import Instrument from "./instrument";
import { MidiOut } from "@/midi";
import type Drome from "@/index";
import { resolveWaveform, type WaveformAlias } from "@/utils/waveform";

interface SynthesizerOptions {
  type?: WaveformAlias;
  host?: Drome;
}

class Synthesizer extends Instrument {
  private _type: Waveform;
  private _notesOut: MidiOut | undefined;

  constructor({ type = "sine", host }: SynthesizerOptions = {}) {
    super([60], host, { a: 0.005, r: 0.005 });
    this._type = resolveWaveform(type);
  }

  type(t: WaveformAlias) {
    this._type = resolveWaveform(t);
    return this;
  }

  out(output: MidiOut) {
    this._notesOut = output;
    return this;
  }

  getSchema(): SynthesizerSchema {
    return {
      type: "synthesizer" as const,
      waveform: this._type,
      notes: {
        source: this._cycle.getSchema(),
        mask: this._cycle.getMask(),
      },
      detune: this._detune.getSchema("detune"),
      gain: this._gain.getSchema(),
      effects: this._effects.map((e) => e.getSchema()),
      muted: this._muted,
      route: this._route,
      notesOut: this._notesOut?.getSchema(),
    };
  }
}

export default Synthesizer;
