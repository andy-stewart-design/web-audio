import { RandomCycle } from "@web-audio/patterns";
import Envelope from "./automations/envelope";
import Lfo, { type LfoInput } from "./automations/lfo";
import { BUILT_IN_BANKS } from "./banks";
import Bus from "./buses/bus";
import Filter from "./effects/filter";
import GainEffect from "./effects/gain";
import Instrument from "./instruments/instrument";
import { MidiBuilders } from "./midi/builders";
import Sampler from "./instruments/sampler";
import Synthesizer from "./instruments/synthesizer";
import {
  isBanked,
  normalizeBankName,
  normalizeSampleBank,
  resolveBank,
} from "./utils/sample-utils";
import { validateDromeGraph } from "@web-audio/schema";
import type { BankSchema, FilterType } from "@web-audio/schema";
import type {
  AudioParamInput,
  CycleInput,
  DromeSchema,
  LoadSamplesInput,
} from "./types";
import type { WaveformAlias } from "./utils/waveform";

class Drome {
  readonly midi = new MidiBuilders();
  private _instruments: Set<Instrument>;
  private _bpm: number | undefined;
  private _banks: Record<string, BankSchema>;
  private _bankNames: Record<string, string>;
  private _buses = new Map<string, Bus>();

  constructor() {
    this._instruments = new Set();
    this._banks = {};
    this._bankNames = {};
  }

  bpm(value: number) {
    this._bpm = value;
    return this;
  }

  synth(type?: WaveformAlias) {
    return new Synthesizer({ host: this, type });
  }

  bus(name: string) {
    const normalized = name.trim();
    if (normalized === "") throw new Error("[Bus] name cannot be empty.");
    let bus = this._buses.get(normalized);
    if (!bus) {
      bus = new Bus(normalized);
      this._buses.set(normalized, bus);
    }
    return bus;
  }

  sample(nameOrToken?: string, variation?: number) {
    if (nameOrToken !== undefined && typeof nameOrToken !== "string") {
      throw new Error("[Drome] sample() name must be a string.");
    }

    if (nameOrToken === undefined) {
      if (variation !== undefined) {
        throw new Error(
          "[Drome] sample() variation requires a sample name argument.",
        );
      }
      return new Sampler(undefined, { host: this });
    }

    const token = nameOrToken.trim();
    const parts = token.split(":");
    if (parts.length > 2) {
      throw new Error(
        "[Drome] sample() shorthand may contain at most one colon.",
      );
    }

    const sampleName = parts[0].trim();
    if (sampleName === "") {
      throw new Error("[Drome] sample() name cannot be empty.");
    }

    let resolvedVariation = variation;
    if (parts.length === 2) {
      if (variation !== undefined) {
        throw new Error(
          "[Drome] sample() shorthand variation cannot be combined with a second argument.",
        );
      }

      const variationToken = parts[1].trim();
      const parsedVariation = Number(variationToken);
      if (variationToken === "" || !Number.isFinite(parsedVariation)) {
        throw new Error(
          "[Drome] sample() shorthand variation must be a finite number.",
        );
      }
      resolvedVariation = parsedVariation;
    }

    if (
      resolvedVariation !== undefined &&
      !Number.isFinite(resolvedVariation)
    ) {
      throw new Error("[Drome] sample() variation must be a finite number.");
    }

    const sampler = new Sampler(sampleName, { host: this });
    if (resolvedVariation !== undefined) {
      sampler.variation(resolvedVariation);
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

    if (isBanked(input)) {
      const bankName = normalizeBankName(input.bank);
      const previousName = this._bankNames[bankName];
      if (previousName !== undefined && previousName !== input.bank) {
        throw new Error(
          `[Drome] Bank name "${input.bank}" conflicts with existing bank "${bankName}".`,
        );
      }
      if (previousName === undefined && this._banks[bankName]) {
        throw new Error(
          `[Drome] Bank name "${input.bank}" conflicts with existing bank "${bankName}".`,
        );
      }
      this._bankNames[bankName] = input.bank;
      this._banks[bankName] = normalized;
    } else {
      this._banks.user ??= { samples: {} };
      Object.assign(this._banks.user.samples, normalized.samples);
    }

    return this;
  }

  rand() {
    return new RandomCycle();
  }

  env(min?: number, ...max: CycleInput<number>) {
    return new Envelope(min, ...max);
  }

  lfo(outputA: LfoInput, outputB: LfoInput) {
    return new Lfo(outputA, outputB);
  }

  gain(...input: AudioParamInput) {
    return new GainEffect(...input);
  }

  filter(type: FilterType, ...frequency: AudioParamInput) {
    return new Filter(type, ...frequency);
  }

  lpf(...frequency: AudioParamInput) {
    return new Filter("lp", ...frequency);
  }

  hpf(...frequency: AudioParamInput) {
    return new Filter("hp", ...frequency);
  }

  bpf(...frequency: AudioParamInput) {
    return new Filter("bp", ...frequency);
  }

  push(inst: Instrument) {
    this._instruments.add(inst);
  }

  _resolveBank(name: string): BankSchema | null {
    const normalized = normalizeBankName(name);
    if (this._banks[normalized]) return this._banks[normalized];
    if (BUILT_IN_BANKS[normalized]) {
      return resolveBank(BUILT_IN_BANKS[normalized]);
    }
    return null;
  }

  getSchema(): DromeSchema {
    const instruments = Array.from(this._instruments).map((i) => i.getSchema());
    const banks: Record<string, BankSchema> = { ...this._banks };

    for (const instrument of instruments) {
      if (instrument.type === "sampler") {
        const bankName = normalizeBankName(instrument.bank);
        const resolvedBank = this._resolveBank(bankName);
        if (!banks[bankName] && resolvedBank) banks[bankName] = resolvedBank;
      }
    }

    const buses = Object.fromEntries(
      Array.from(this._buses, ([name, bus]) => [name, bus.getSchema()]),
    );
    const schema = {
      bpm: this._bpm,
      instruments,
      banks,
      buses,
    };
    validateDromeGraph(schema);
    return schema;
  }
}

export default Drome;
