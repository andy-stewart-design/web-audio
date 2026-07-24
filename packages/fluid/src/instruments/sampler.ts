import SampleNotes from "@/patterns/sample-notes";
import Parameter from "@/patterns/parameter";
import type { CycleInput } from "@/types";
import type {
  ClipMode,
  FitSchema,
  ParameterSchema,
  SamplerSchema,
} from "@web-audio/schema";
import {
  getChopSequenceSchema,
  getDefaultNotesForSequence,
  getDefaultNotes,
  getNotesForChopTiming,
  getRegion,
  getSourceKeys,
  type ChopState,
} from "./sampler-utils";
import { DEFAULT_BANK } from "@/banks";
import Instrument from "./instrument";
import type Drome from "@/index";

interface SamplerOptions {
  bank?: string;
  host?: Drome;
}

class Sampler extends Instrument {
  private _bank: string;
  private _sample: string;
  private _variation: Parameter;
  private _fit: FitSchema | null = null;
  private _regionStart: Parameter | null = null;
  private _regionEnd: Parameter | null = null;
  private _chop: ChopState | null = null;
  private _explicitNotes = false;
  private _loop = false;
  private _clipMode: ClipMode = "clipped";

  constructor(
    sample: string,
    { bank = DEFAULT_BANK, host }: SamplerOptions = {},
  ) {
    super([0], host, { a: 0.0025, r: 0.005 });
    this._cycle = new SampleNotes([0]);
    this._bank = bank;
    this._sample = sample;
    this._variation = new Parameter(0);
  }

  // METHOD ALIASES
  var(...input: CycleInput) {
    return this.variation(...input);
  }

  // INSTANCE METHODS
  bank(name: string) {
    this._bank = name;
    return this;
  }

  variation(...input: CycleInput) {
    this._variation = new Parameter(...input);
    return this;
  }

  fit(bars: number) {
    if (!Number.isInteger(bars) || bars <= 0) {
      throw new Error("[Sampler] fit() bars must be a positive integer.");
    }

    this._fit = { type: "fit", bars };
    return this;
  }

  notes(...input: Parameters<Instrument["notes"]>) {
    this._explicitNotes = true;
    return super.notes(...input);
  }

  start(...input: CycleInput) {
    this._regionStart = new Parameter(...input);
    return this;
  }

  end(...input: CycleInput) {
    this._regionEnd = new Parameter(...input);
    return this;
  }

  chop(sliceCount: number, ...sequence: CycleInput) {
    if (!Number.isInteger(sliceCount) || sliceCount <= 0) {
      throw new Error(
        "[Sampler] chop() sliceCount must be a positive integer.",
      );
    }

    this._chop = {
      sliceCount,
      sequence: sequence.length > 0 ? new Parameter(...sequence) : null,
    };
    return this;
  }

  loop(enabled = true) {
    this._loop = enabled;
    return this;
  }

  clip(enabled = true) {
    this._clipMode = enabled ? "clipped" : "one-shot";
    return this;
  }

  private _getGeneratedFit() {
    const hasRegion = this._regionStart || this._regionEnd;
    const unfit = this._explicitNotes || this._chop || hasRegion;
    if (unfit) return null;
    return this._fit;
  }

  private _getNotes(sourceKeys: number[]): ParameterSchema {
    if (this._chop) {
      const sequence = this._chop.sequence
        ? getChopSequenceSchema(this._chop)
        : null;
      if (this._explicitNotes && sequence) {
        const notes = this._cycle.getSchema();
        if (notes.type === "static" && sequence.type === "static") {
          return getNotesForChopTiming(notes, sequence);
        }
      }

      if (!this._explicitNotes) {
        const noteValue = sourceKeys[0] ?? 0;
        if (sequence) {
          return getDefaultNotesForSequence(noteValue, sequence, this._chop);
        }

        return getDefaultNotes(
          noteValue,
          this._chop.sliceCount,
          this._fit?.bars ?? 1,
          { globalStepIndex: true },
        );
      }
    }

    const generatedFit = this._getGeneratedFit();
    if (generatedFit) {
      return getDefaultNotes(
        sourceKeys[0] ?? 0,
        generatedFit.bars,
        generatedFit.bars,
      );
    }

    return this._cycle.getSchema();
  }

  getSchema(): SamplerSchema {
    const sourceKeys = getSourceKeys(this._bank, this._sample, this._host);

    const region = getRegion(
      this._getGeneratedFit(),
      this._chop,
      this._regionStart,
      this._regionEnd,
    );
    const notes = this._getNotes(sourceKeys);

    return {
      type: "sampler",
      bank: this._bank,
      sample: this._sample,
      variation: this._variation.getSchema(),
      notes,
      fit: this._fit,
      region,
      sourceKeys,
      detune: this._detune.getSchema("detune"),
      gain: this._gain.getSchema(),
      effects: this._effects.map((e) => e.getSchema()),
      muted: this._muted,
      loop: this._loop,
      clipMode: this._clipMode,
    };
  }
}

export default Sampler;
