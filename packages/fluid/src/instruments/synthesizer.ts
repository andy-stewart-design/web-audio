import type { SynthesizerSchema, Waveform } from "@web-audio/schema";
import Instrument from "./instrument";
import { createSynthEventState } from "@/events/transitions";
import { compileSynthEventState } from "@/events/compiler";
import { MidiOut } from "@/midi/builders";
import type Drome from "@/drome";
import { resolveWaveform, type WaveformAlias } from "@/inputs/waveform";

interface SynthesizerOptions {
  type?: WaveformAlias;
  host?: Drome;
}

class Synthesizer extends Instrument {
  protected _eventState = createSynthEventState();
  private _type: Waveform;
  private _notesOut: MidiOut | undefined;

  constructor({ type = "sine", host }: SynthesizerOptions = {}) {
    super(host, { a: 0.005, r: 0.005 });
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
      eventPattern: compileSynthEventState(this._eventState),
      detune: this._detune.getSchema("detune"),
      gain: this._gain.getSchema(),
      effects: this._effects.map((e) => e.getSchema()),
      muted: this._muted,
      route: this._route,
      sends: Object.fromEntries(this._sends),
      notesOut: this._notesOut?.getSchema(),
    };
  }
}

export default Synthesizer;
