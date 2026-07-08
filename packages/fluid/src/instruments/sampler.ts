import SampleNotes from "@/patterns/sample-notes";
import Parameter from "@/patterns/parameter";
import type { CycleInput } from "@/types";
import type {
  ClipMode,
  FitSchema,
  ParameterSchema,
  RegionSchema,
  SamplerSchema,
  StaticSchema,
  StaticSchemaValue,
} from "@web-audio/schema";
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
  private _chop: { sliceCount: number; sequence: Parameter | null } | null =
    null;
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

  private _getRegion(): RegionSchema | null {
    const generatedFit = this._getGeneratedFit();
    if (generatedFit) {
      const { bars } = generatedFit;
      return {
        type: "chop",
        slices: Array.from({ length: bars }, (_, i) => ({
          start: i / bars,
          end: (i + 1) / bars,
        })),
        sequence: {
          type: "static",
          polyphonic: false,
          cycle: Array.from({ length: bars }, (_, i) => [
            { value: i, offset: 0, duration: 1, stepIndex: 0 },
          ]),
        },
      };
    }

    if (this._chop) {
      const { sliceCount } = this._chop;
      const sequence =
        this._chop.sequence ??
        new Parameter(Array.from({ length: sliceCount }, (_, i) => i));
      const sequenceSchema = sequence.getSchema();
      this._warnOutOfRangeChopIndices(sliceCount, sequenceSchema);

      return {
        type: "chop",
        slices: Array.from({ length: sliceCount }, (_, i) => ({
          start: i / sliceCount,
          end: (i + 1) / sliceCount,
        })),
        sequence: sequenceSchema,
      };
    }

    if (!this._regionStart && !this._regionEnd) return null;

    const start = this._regionStart ?? new Parameter(0);
    const end = this._regionEnd ?? new Parameter(1);
    const startSchema = start.getSchema();
    const endSchema = end.getSchema();

    this._validateRegionParam("start", startSchema);
    this._validateRegionParam("end", endSchema);
    this._validateRegionBounds(startSchema, endSchema);

    return {
      type: "static",
      start: startSchema,
      end: endSchema,
    };
  }

  private _warnOutOfRangeChopIndices(
    sliceCount: number,
    schema: ParameterSchema,
  ) {
    if (schema.type !== "static") return;

    for (const bar of schema.cycle) {
      for (const step of bar) {
        if (step.value < 0 || step.value > sliceCount - 1) {
          console.warn(
            `[Sampler] chop() sequence index ${step.value} is outside [0, ${sliceCount - 1}] and will wrap in the engine.`,
          );
        }
      }
    }
  }

  private _validateRegionParam(name: "start" | "end", schema: ParameterSchema) {
    if (schema.type === "random") {
      if (schema.range && (schema.range.min < 0 || schema.range.max > 1)) {
        console.warn(
          `[Sampler] ${name}() random range is outside [0, 1]; resolved values will be clamped by the engine.`,
        );
      }
      return;
    }

    for (const bar of schema.cycle) {
      for (const step of bar) {
        if (!Number.isFinite(step.value) || step.value < 0 || step.value > 1) {
          throw new Error(
            `[Sampler] ${name}() values must be finite numbers in [0, 1].`,
          );
        }
      }
    }
  }

  private _validateRegionBounds(start: ParameterSchema, end: ParameterSchema) {
    if (start.type !== "static" || end.type !== "static") return;
    if (start.cycle.length !== 1 || end.cycle.length !== 1) return;
    if (start.cycle[0].length !== 1 || end.cycle[0].length !== 1) return;

    if (start.cycle[0][0].value >= end.cycle[0][0].value) {
      throw new Error("[Sampler] start() must be less than end().");
    }
  }

  private _getNotes(sourceKeys: number[]): ParameterSchema {
    if (this._chop) {
      const sequence = this._chop.sequence?.getSchema();
      if (this._explicitNotes && sequence) {
        const notes = this._cycle.getSchema();
        if (notes.type === "static" && sequence.type === "static") {
          return this._getNotesForChopTiming(notes, sequence);
        }
      }

      if (!this._explicitNotes) {
        const noteValue = sourceKeys[0] ?? 0;
        if (sequence) {
          return this._getDefaultNotesForSequence(noteValue, sequence);
        }

        return this._getDefaultNotes(
          noteValue,
          this._chop.sliceCount,
          this._fit?.bars ?? 1,
          { globalStepIndex: true },
        );
      }
    }

    const generatedFit = this._getGeneratedFit();
    if (generatedFit) {
      return this._getDefaultNotes(
        sourceKeys[0] ?? 0,
        generatedFit.bars,
        generatedFit.bars,
      );
    }

    return this._cycle.getSchema();
  }

  private _getNotesForChopTiming(notes: StaticSchema, sequence: StaticSchema) {
    const noteValues = notes.cycle.flat().map((step) => step.value);

    return {
      type: "static",
      polyphonic: notes.polyphonic,
      cycle: sequence.cycle.map((bar) =>
        bar.map(({ offset, duration, stepIndex }) => ({
          value: noteValues[stepIndex % noteValues.length] ?? 0,
          offset,
          duration,
          stepIndex,
        })),
      ),
    } satisfies ParameterSchema;
  }

  private _getDefaultNotesForSequence(
    noteValue: number,
    sequence: ParameterSchema,
  ) {
    if (sequence.type === "random") {
      return this._getDefaultNotes(noteValue, this._chop?.sliceCount ?? 1, 1);
    }

    return {
      type: "static",
      polyphonic: false,
      cycle: sequence.cycle.map((bar) =>
        bar.map(({ offset, duration, stepIndex }) => ({
          value: noteValue,
          offset,
          duration,
          stepIndex,
        })),
      ),
    } satisfies ParameterSchema;
  }

  private _getDefaultNotes(
    noteValue: number,
    noteCount: number,
    bars: number,
    { globalStepIndex = false } = {},
  ) {
    const cycle: StaticSchemaValue[][] = Array.from({ length: bars }, () => []);
    const duration = bars / noteCount;

    for (let stepIndex = 0; stepIndex < noteCount; stepIndex++) {
      const absoluteOffset = stepIndex * duration;
      const barIndex = Math.min(bars - 1, Math.floor(absoluteOffset));
      const localStepIndex = cycle[barIndex].length;
      cycle[barIndex].push({
        value: noteValue,
        offset: absoluteOffset - barIndex,
        duration,
        stepIndex: globalStepIndex ? stepIndex : localStepIndex,
      });
    }

    return {
      type: "static",
      polyphonic: false,
      cycle,
    } satisfies ParameterSchema;
  }

  private _getGeneratedFit() {
    const hasRegion = this._regionStart || this._regionEnd;
    const unfit = this._explicitNotes || this._chop || hasRegion;
    if (unfit) return null;
    return this._fit;
  }

  private _getSourceKeys() {
    const bank = this._host?._resolveBank(this._bank);
    if (!bank) {
      console.warn(
        `[Sampler] Bank "${this._bank}" not found — did you forget to call loadSamples()? ` +
          "Defaulting to sourceKeys: [0]. This sampler will not produce audio.",
      );
      return [0];
    }

    const sample = bank.samples[this._sample];
    if (!sample) {
      console.warn(
        `[Sampler] Sample "${this._sample}" not found in bank "${this._bank}". ` +
          "Defaulting to sourceKeys: [0]. This sampler will not produce audio.",
      );
      return [0];
    }

    return Object.keys(sample)
      .map(Number)
      .sort((a, b) => a - b);
  }

  getSchema(): SamplerSchema {
    const sourceKeys = this._getSourceKeys();

    const region = this._getRegion();
    const notes = this._getNotes(sourceKeys);

    console.log({
      type: "sampler",
      bank: this._bank,
      sample: this._sample,
      variation: this._variation.getSchema(),
      notes,
      fit: this._fit,
      region,
      sourceKeys,
      detune: this._detune.getSchema(),
      gain: this._gain.getSchema(),
      effects: this._effects.map((e) => e.getSchema()),
      loop: this._loop,
      clipMode: this._clipMode,
    });

    return {
      type: "sampler",
      bank: this._bank,
      sample: this._sample,
      variation: this._variation.getSchema(),
      notes,
      fit: this._fit,
      region,
      sourceKeys,
      detune: this._detune.getSchema(),
      gain: this._gain.getSchema(),
      effects: this._effects.map((e) => e.getSchema()),
      loop: this._loop,
      clipMode: this._clipMode,
    };
  }
}

export default Sampler;
