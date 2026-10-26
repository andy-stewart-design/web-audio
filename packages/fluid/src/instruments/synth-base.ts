import type Drome from "@/drome";
import { createSynthEventState } from "@/events/transitions";
import { MidiOut } from "@/midi/builders";
import type { AudioParamSource } from "@/parameters/parameter";
import Instrument from "./instrument";
import { compileSynthEventState } from "@/events/compiler";
import type {
  BasicSynthesizerSchema,
  UnisonSynthesizerSchema,
} from "@web-audio/schema";

abstract class SynthBase extends Instrument {
  protected _eventState = createSynthEventState();
  protected _notesOut: MidiOut | undefined;
  private _sourceGain: AudioParamSource | undefined;

  constructor(host?: Drome, sourceGain?: AudioParamSource) {
    super(host, { a: 0.005, r: 0.005 });
    this._sourceGain = sourceGain;
  }

  out(output: MidiOut) {
    this._notesOut = output;
    return this;
  }

  protected _getSynthSchema() {
    return {
      type: "synthesizer" as const,
      eventPattern: compileSynthEventState(this._eventState, {
        legato: this._legato,
      }),
      detune: this._getAudioParamSchema(this._detune, "detune"),
      gain: this._gain.getSchema(),
      ...(this._sourceGain
        ? { sourceGain: this._getAudioParamSchema(this._sourceGain, "gain") }
        : {}),
      effects: this._effects.map((effect) => effect.getSchema()),
      muted: this._muted,
      route: this._route,
      sends: Object.fromEntries(this._sends),
      ducks: Object.fromEntries(this._ducks),
      ...this._getNoiseSchema(),
      notesOut: this._notesOut?.getSchema(),
    } satisfies Omit<
      BasicSynthesizerSchema | UnisonSynthesizerSchema,
      "waveform" | "engine"
    >;
  }
}

export default SynthBase;
