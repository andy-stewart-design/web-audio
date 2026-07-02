import { RandomCycle } from "@web-audio/patterns";
import Envelope from "./automations/envelope";
import Lfo, { type LfoInput } from "./automations/lfo";
import { BUILT_IN_BANKS } from "./banks";
import Filter from "./effects/filter";
import GainEffect from "./effects/gain";
import Instrument from "./instruments/instrument";
import Sampler from "./instruments/sampler";
import Synthesizer from "./instruments/synthesizer";
import {
  isNamed,
  normalizeSampleBank,
  resolveBank,
} from "./utils/sample-utils";
import type { BankSchema, FilterType } from "@web-audio/schema";
import type { CycleInput, DromeSchema, LoadSamplesInput } from "./types";
import type { WaveformAlias } from "./utils/waveform";

class Drome {
  private _instruments: Set<Instrument>;
  private _bpm: number | undefined;
  private _banks: Record<string, BankSchema>;

  constructor() {
    this._instruments = new Set();
    this._banks = {};
  }

  bpm(value: number) {
    this._bpm = value;
    return this;
  }

  synth(type?: WaveformAlias) {
    return new Synthesizer({ host: this, type });
  }

  sample(nameOrToken: string, variation?: number) {
    const [sampleName, variationStr] = nameOrToken.split(":");
    const sampler = new Sampler(sampleName, { host: this });
    if (variationStr !== undefined) {
      sampler.variation(parseInt(variationStr, 10));
    } else if (variation !== undefined) {
      sampler.variation(variation);
    }
    return sampler;
  }

  loadSamples(input: string): Promise<this>;
  loadSamples(input: LoadSamplesInput): this;
  loadSamples(input: string | LoadSamplesInput): this | Promise<this> {
    if (typeof input === "string") {
      return fetch(input)
        .then((res) => {
          if (!res.ok) {
            throw new Error(
              `Failed to load sample manifest from ${input}: HTTP ${res.status}`,
            );
          }
          return res.json();
        })
        .then((json: unknown) => this._loadSamples(json));
    }

    return this._loadSamples(input);
  }

  private _loadSamples(input: unknown) {
    const normalized = normalizeSampleBank(input);

    if (isNamed(input)) {
      this._banks[input.name] = normalized;
    } else {
      this._banks.user ??= { samples: {} };
      Object.assign(this._banks.user.samples, normalized.samples);
    }

    return this;
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

  push(inst: Instrument) {
    this._instruments.add(inst);
  }

  _resolveBank(name: string): BankSchema | null {
    if (this._banks[name]) return this._banks[name];
    if (BUILT_IN_BANKS[name]) return resolveBank(BUILT_IN_BANKS[name]);
    return null;
  }

  getSchema(): DromeSchema {
    const instruments = Array.from(this._instruments).map((i) => i.getSchema());
    const banks: Record<string, BankSchema> = { ...this._banks };

    for (const instrument of instruments) {
      if (instrument.type === "sampler") {
        const { bank: bankName } = instrument;
        const resolvedBank = this._resolveBank(bankName);
        if (!banks[bankName] && resolvedBank) banks[bankName] = resolvedBank;
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
