import { RandomCycle } from "@web-audio/patterns";
import Envelope from "./automations/envelope";
import Lfo, { type LfoInput } from "./automations/lfo";
import { BUILT_IN_BANKS } from "./banks";
import Filter from "./effects/filter";
import GainEffect from "./effects/gain";
import Sampler from "./instruments/sampler";
import Synthesizer from "./instruments/synthesizer";
import { resolveBank } from "./utils/sample-utils";
import type { CycleInput, DromeSchema } from "./types";
import type { WaveformAlias } from "./utils/waveform";
import type { BankSchema, FilterType } from "@web-audio/schema";

class Drome {
  private _instruments: Set<Synthesizer | Sampler>;
  private _bpm: number | undefined;

  constructor() {
    this._instruments = new Set();
  }

  bpm(value: number) {
    this._bpm = value;
    return this;
  }

  synth(type?: WaveformAlias) {
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

  push(inst: Synthesizer | Sampler) {
    this._instruments.add(inst);
  }

  getSchema(): DromeSchema {
    const instruments = Array.from(this._instruments).map((i) => i.getSchema());
    const banks: Record<string, BankSchema> = {};

    for (const instrument of instruments) {
      if (instrument.type === "sampler") {
        const { bank: bankName } = instrument;
        if (!banks[bankName] && BUILT_IN_BANKS[bankName]) {
          banks[bankName] = resolveBank(BUILT_IN_BANKS[bankName]);
        } else if (!banks[bankName]) {
          console.warn(`[Sampler] Unknown bank "${bankName}" — skipping`);
        }
      }
    }

    return {
      ...(this._bpm !== undefined && { bpm: this._bpm }),
      instruments,
      banks,
    };
  }
}

export default Drome;
