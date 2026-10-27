import {
  createShorthand,
  createStructuredInput,
  RandomCycle,
  type Shorthand,
  type StructuredArgument,
  type StructuredAtom,
} from "@web-audio/patterns";
import Envelope from "./automations/envelope";
import Lfo from "./automations/lfo";
import { BUILT_IN_BANKS } from "./samples/built-in-banks";
import Bus from "./buses/bus";
import Filter from "./effects/filter";
import GainEffect from "./effects/gain";
import Instrument from "./instruments/instrument";
import { MidiBuilders } from "./midi/builders";
import Sampler from "./instruments/sampler";
import Synthesizer from "./instruments/synthesizer";
import UnisonSynthesizer from "./instruments/unison-synthesizer";
import {
  isBanked,
  isAlias,
  normalizeBankName,
  normalizeSampleBank,
  resolveBank,
} from "./samples/normalize-bank";
import { validateDromeGraph } from "@web-audio/schema";
import type { BankSchema, DromeSchema, FilterType } from "@web-audio/schema";
import type { AudioParamInput } from "./parameters/parameter";
import { resolveAudioParamValue } from "./parameters/resolve-audio-param";
import type {
  NumericPatternValue,
  SingleSlotAudioParamInput,
} from "./inputs/types";
import type { LoadSamplesInput } from "./samples/types";
import {
  synthSelectorAliasMap,
  type SynthEngineAlias,
  type SynthSelector,
  type WaveformAlias,
} from "./inputs/waveform";

class Drome {
  readonly midi = new MidiBuilders();
  private _instruments: Set<Instrument>;
  private _bpm: number | undefined;
  private _banks: Record<string, BankSchema>;
  private _bankNames: Record<string, string>;
  private _buses = new Map<string, Bus>();
  sh: (source: string) => Shorthand;
  str: Drome["structured"];

  constructor() {
    this._instruments = new Set();
    this._banks = Object.create(null);
    this._bankNames = Object.create(null);
    this.sh = this.shorthand.bind(this);
    this.str = this.structured.bind(this);
  }

  bpm(value: number) {
    this._bpm = value;
    return this;
  }

  shorthand(source: string) {
    return createShorthand(source);
  }

  structured<T extends StructuredAtom>(
    ...input: [StructuredArgument<T>, ...StructuredArgument<T>[]]
  ) {
    return createStructuredInput(...input);
  }

  synth(type?: WaveformAlias, gain?: SingleSlotAudioParamInput): Synthesizer;
  synth(
    type: SynthEngineAlias,
    gain?: SingleSlotAudioParamInput,
  ): UnisonSynthesizer;
  synth(
    type?: SynthSelector,
    gain?: SingleSlotAudioParamInput,
  ): Synthesizer | UnisonSynthesizer;
  synth<Gain extends SingleSlotAudioParamInput>(
    gain: Gain,
  ): Gain extends SynthEngineAlias
    ? UnisonSynthesizer
    : string extends Gain
      ? Synthesizer | UnisonSynthesizer
      : Synthesizer;
  synth(
    type?: string | SingleSlotAudioParamInput,
    gain?: SingleSlotAudioParamInput,
  ) {
    if (arguments.length > 2) {
      throw new TypeError("[Drome] synth() accepts at most two values.");
    }

    let selector: SynthSelector | undefined;
    let sourceGain;
    if (arguments.length === 2) {
      if (isSynthSelector(type) || type === undefined) {
        selector = type;
      } else {
        throw new TypeError(`[Drome] Unsupported synth engine "${type}".`);
      }
      if (gain !== undefined) {
        sourceGain = resolveAudioParamValue(gain, "[Drome] synth() gain");
      }
    } else if (type !== undefined) {
      if (isSynthSelector(type)) {
        selector = type;
      } else {
        sourceGain = resolveAudioParamValue(type, "[Drome] synth() gain");
      }
    }

    const normalizedSelector =
      selector === undefined ? undefined : synthSelectorAliasMap[selector];
    if (normalizedSelector === "unison") {
      return new UnisonSynthesizer({ host: this, sourceGain });
    }
    return new Synthesizer({
      host: this,
      type: normalizedSelector,
      sourceGain,
    });
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
    if (!isAlias(sampleName)) {
      throw new Error("[Drome] sample() name must match [A-Za-z0-9]+.");
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
      const hasBankName = Object.prototype.hasOwnProperty.call(
        this._bankNames,
        bankName,
      );
      const previousName = hasBankName ? this._bankNames[bankName] : undefined;
      if (previousName !== undefined && previousName !== input.bank) {
        throw new Error(
          `[Drome] Bank name "${input.bank}" conflicts with existing bank "${bankName}".`,
        );
      }
      if (
        !hasBankName &&
        Object.prototype.hasOwnProperty.call(this._banks, bankName)
      ) {
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

  env(minOrMax?: NumericPatternValue, maximum?: NumericPatternValue) {
    if (arguments.length > 2) {
      throw new TypeError("[Drome] env() accepts at most two values.");
    }
    return arguments.length < 2
      ? new Envelope(minOrMax)
      : new Envelope(minOrMax, maximum);
  }

  lfo(outputA: NumericPatternValue, outputB: NumericPatternValue) {
    if (arguments.length !== 2) {
      throw new TypeError(
        "[Drome] lfo() requires exactly two endpoint values.",
      );
    }
    return new Lfo(outputA, outputB);
  }

  gain(...input: AudioParamInput) {
    return new GainEffect(...input);
  }

  filter(type: FilterType, frequency: SingleSlotAudioParamInput) {
    if (type === undefined) {
      throw new TypeError("[Drome] filter() filter type is required.");
    }
    if (arguments.length < 2) {
      throw new TypeError("[Drome] filter() frequency is required.");
    }
    if (arguments.length > 2) {
      throw new TypeError("[Drome] filter() accepts one frequency value.");
    }
    return new Filter(type, frequency);
  }

  lpf(...frequency: AudioParamInput) {
    return Filter.fromVariadicFrequency("lp", frequency);
  }

  hpf(...frequency: AudioParamInput) {
    return Filter.fromVariadicFrequency("hp", frequency);
  }

  bpf(...frequency: AudioParamInput) {
    return Filter.fromVariadicFrequency("bp", frequency);
  }

  push(inst: Instrument) {
    this._instruments.add(inst);
  }

  _resolveBank(name: string): BankSchema | null {
    const normalized = normalizeBankName(name);
    if (Object.prototype.hasOwnProperty.call(this._banks, normalized)) {
      return this._banks[normalized];
    }
    if (Object.prototype.hasOwnProperty.call(BUILT_IN_BANKS, normalized)) {
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
        if (
          !Object.prototype.hasOwnProperty.call(banks, bankName) &&
          resolvedBank
        )
          banks[bankName] = resolvedBank;
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

function isSynthSelector(value: unknown): value is SynthSelector {
  return (
    typeof value === "string" && Object.hasOwn(synthSelectorAliasMap, value)
  );
}

export default Drome;
