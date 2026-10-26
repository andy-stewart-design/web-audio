import type Drome from "@/drome";
import { createSynthEventState } from "@/events/transitions";
import { MidiOut } from "@/midi/builders";
import type { AudioParamSource } from "@/parameters/parameter";
import Instrument from "./instrument";
import { compileSynthEventState } from "@/events/compiler";
import type {
  BasicSynthesizerSchema,
  SubSynthesizerSchema,
  UnisonSynthesizerSchema,
  Waveform,
} from "@web-audio/schema";
import {
  resolveWaveform,
  waveformAliasMap,
  type WaveformAlias,
} from "@/inputs/waveform";
import type { SingleSlotAudioParamInput } from "@/inputs/types";
import { resolveAudioParamValue } from "@/parameters/resolve-audio-param";

abstract class SynthBase extends Instrument {
  protected _eventState = createSynthEventState();
  protected _notesOut: MidiOut | undefined;
  private _sourceGain: AudioParamSource | undefined;
  private _sub:
    | { waveform: Waveform; octave: -1 | -2; gain: AudioParamSource }
    | undefined;

  constructor(host?: Drome, sourceGain?: AudioParamSource) {
    super(host, { a: 0.005, r: 0.005 });
    this._sourceGain = sourceGain;
  }

  out(output: MidiOut) {
    this._notesOut = output;
    return this;
  }

  sub(gain: SingleSlotAudioParamInput): this;
  sub(octave: -1 | -2, gain: SingleSlotAudioParamInput): this;
  sub(
    waveform: WaveformAlias,
    octave: -1 | -2,
    gain: SingleSlotAudioParamInput,
  ): this;
  sub(
    waveformOrOctaveOrGain: WaveformAlias | -1 | -2 | SingleSlotAudioParamInput,
    octaveOrGain?: -1 | -2 | SingleSlotAudioParamInput,
    gain?: SingleSlotAudioParamInput,
  ) {
    let waveform: Waveform = "sine";
    let octave: -1 | -2 = -1;
    let gainInput: SingleSlotAudioParamInput;

    if (arguments.length === 1) {
      gainInput = waveformOrOctaveOrGain as SingleSlotAudioParamInput;
    } else if (arguments.length === 2) {
      if (waveformOrOctaveOrGain !== -1 && waveformOrOctaveOrGain !== -2) {
        throw new TypeError(
          "[Synth] sub() requires an octave and gain for the two-argument form.",
        );
      }
      octave = waveformOrOctaveOrGain;
      gainInput = octaveOrGain as SingleSlotAudioParamInput;
    } else if (arguments.length === 3) {
      if (!isWaveformAlias(waveformOrOctaveOrGain)) {
        throw new TypeError("[Synth] sub() waveform is invalid.");
      }
      if (octaveOrGain !== -1 && octaveOrGain !== -2) {
        throw new TypeError("[Synth] sub() octave must be -1 or -2.");
      }
      waveform = resolveWaveform(waveformOrOctaveOrGain);
      octave = octaveOrGain;
      gainInput = gain as SingleSlotAudioParamInput;
    } else {
      throw new TypeError(
        "[Synth] sub() requires gain, octave and gain, or waveform, octave and gain.",
      );
    }

    const resolvedGain = resolveAudioParamValue(
      gainInput,
      "[Synth] sub() gain",
    );
    this._sub = { waveform, octave, gain: resolvedGain };
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
      ...(this._sub
        ? {
            sub: {
              waveform: this._sub.waveform,
              octave: this._sub.octave,
              gain: this._getAudioParamSchema(this._sub.gain, "gain"),
            } satisfies SubSynthesizerSchema,
          }
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

function isWaveformAlias(value: unknown): value is WaveformAlias {
  return typeof value === "string" && Object.hasOwn(waveformAliasMap, value);
}

export default SynthBase;
