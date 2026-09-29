import AuthoredPitches from "@/patterns/authored-pitches";
import Parameter from "@/patterns/parameter";
import type {
  CycleInput,
  NullableCycleInput,
  StaticNullableCycleInput,
} from "@/types";
import type {
  ClipMode,
  FitSchema,
  SampleDirection,
  SamplerSchema,
} from "@web-audio/schema";
import AuthoredEventValues from "@/patterns/authored-event-values";
import {
  getChopTiming,
  getDistributedTiming,
  getRegion,
  type ChopState,
  type RegionState,
} from "./sampler-utils";
import { compileSamplerEvents, getSamplerEventTiming } from "./event-compiler";
import { DEFAULT_BANK } from "@/banks";
import Instrument from "./instrument";
import type Drome from "@/index";
import { normalizeBankName } from "@/utils/sample-utils";
import { isRandomCycleTuple } from "@/utils/validate";

interface SamplerOptions {
  bank?: string;
  host?: Drome;
}

type SampleDirectionInput = SampleDirection | "for" | "rev" | "alt";

class Sampler extends Instrument {
  private _bank: string;
  private _sampleNames: AuthoredEventValues<string> | undefined;
  private _variation: AuthoredEventValues<number>;
  private _fit: FitSchema | null = null;
  private _region: RegionState | null = null;
  private _chop: ChopState | null = null;
  private _loop = false;
  private _clipMode: ClipMode = "clipped";
  private _direction: SampleDirection = "forward";

  dur: (...input: CycleInput<number>) => this;
  dir: (direction: SampleDirectionInput) => this;

  constructor(
    sample: string | undefined,
    { bank = DEFAULT_BANK, host }: SamplerOptions = {},
  ) {
    super([0], host, { a: 0.0025, r: 0.005 });
    this._pitches = new AuthoredPitches([0]);
    this._bank = normalizeBankName(bank);
    this._sampleNames = sample
      ? AuthoredEventValues.fromDefault(sample.trim())
      : undefined;
    this._variation = AuthoredEventValues.fromDefault(0);
    this.dur = this.duration.bind(this);
    this.dir = this.direction.bind(this);
  }

  override reverse() {
    this._materializeEventsForTransform();
    this._pitches.reverse();
    this._timing.reverse();
    this._variation.reverse();
    this._sampleNames?.reverse();
    return this;
  }

  override fast(multiplier: number) {
    this._materializeEventsForTransform();
    this._pitches.fast(multiplier);
    this._timing.fast(multiplier);
    this._variation.fast(multiplier);
    this._sampleNames?.fast(multiplier);
    return this;
  }

  override slow(multiplier: number) {
    this._materializeEventsForTransform();
    this._pitches.slow(multiplier);
    this._timing.slow(multiplier);
    this._variation.slow(multiplier);
    this._sampleNames?.slow(multiplier);
    return this;
  }

  override stretch(bars: number, steps?: number) {
    this._materializeEventsForTransform();
    this._pitches.stretch(bars, steps);
    this._timing.stretch(bars, steps);
    this._variation.stretch(bars, steps);
    this._sampleNames?.stretch(bars, steps);
    return this;
  }

  // METHOD ALIASES
  var(...input: NullableCycleInput<number>) {
    return this.variation(...input);
  }

  // INSTANCE METHODS
  name(...input: StaticNullableCycleInput<string>) {
    if (input.length === 0) {
      throw new Error("[Sampler] name() requires at least one pattern.");
    }
    if (isRandomCycleTuple(input)) {
      throw new Error("[Sampler] name() does not support random patterns.");
    }

    this._sampleNames = AuthoredEventValues.fromInput(input, {
      normalizeValue: (value) => value.trim(),
      validateValue: (value) => value.length > 0,
      invalidValueMessage: "[Sampler] name() sample names must be non-empty.",
      invalidGroupMessage:
        "[Sampler] name() simultaneous voice groups cannot be empty.",
      invalidRestMessage:
        "[Sampler] name() null is only allowed as a whole-hit rest.",
    });
    this._invalidateMaterializedTiming();
    return this;
  }

  bank(name: string) {
    this._bank = normalizeBankName(name);
    return this;
  }

  variation(...input: NullableCycleInput<number>) {
    if (input.length === 0) {
      throw new Error("[Sampler] variation() requires at least one pattern.");
    }

    this._variation = AuthoredEventValues.fromInput(input, {
      validateValue: Number.isFinite,
      invalidValueMessage:
        "[Sampler] variation() values must be finite numbers.",
      invalidGroupMessage:
        "[Sampler] variation() simultaneous voice groups cannot be empty.",
      invalidRestMessage:
        "[Sampler] variation() null is only allowed as a whole-hit rest.",
    });
    this._invalidateMaterializedTiming();
    return this;
  }

  fit(bars: number) {
    if (!Number.isInteger(bars) || bars <= 0) {
      throw new Error("[Sampler] fit() bars must be a positive integer.");
    }

    this._fit = { type: "fit", bars };
    this._invalidateMaterializedTiming();
    return this;
  }

  start(...input: CycleInput<number>) {
    const start = new Parameter(...input);
    this._region = this._region
      ? { ...this._region, start }
      : { start, mode: "end", end: null };
    return this;
  }

  end(...input: CycleInput<number>) {
    this._region = {
      start: this._region?.start ?? null,
      mode: "end",
      end: new Parameter(...input),
    };
    return this;
  }

  duration(...input: CycleInput<number>) {
    this._region = {
      start: this._region?.start ?? null,
      mode: "duration",
      duration: new Parameter(...input),
    };
    return this;
  }

  chop(sliceCount: number, ...sequence: CycleInput<number>) {
    if (!Number.isInteger(sliceCount) || sliceCount <= 0) {
      throw new Error(
        "[Sampler] chop() sliceCount must be a positive integer.",
      );
    }

    this._chop = {
      sliceCount,
      sequence: sequence.length > 0 ? new Parameter(...sequence) : null,
    };
    this._invalidateMaterializedTiming();
    return this;
  }

  direction(direction: SampleDirectionInput) {
    let resolvedDirection: SampleDirection;
    switch (direction) {
      case "for":
        resolvedDirection = "forward";
        break;
      case "rev":
        resolvedDirection = "reverse";
        break;
      case "alt":
        resolvedDirection = "alternate";
        break;
      default:
        resolvedDirection = direction;
    }

    if (
      resolvedDirection !== "forward" &&
      resolvedDirection !== "reverse" &&
      resolvedDirection !== "alternate"
    ) {
      throw new Error(
        '[Sampler] direction() must be "forward", "reverse", "alternate", "for", "rev", or "alt".',
      );
    }

    this._direction = resolvedDirection;
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

  protected override _invalidateMaterializedTiming() {
    super._invalidateMaterializedTiming();
    this._variation.useCandidateOrdinalAvailability();
  }

  private _materializeEventsForTransform() {
    const timingOverride = this._getTimingOverride();
    if (timingOverride) return;

    const timing = getSamplerEventTiming({
      pitches: this._pitches,
      timing: this._timing,
      variation: this._variation,
      sampleNames: this._sampleNames,
    });
    this._materializePitchesForTransform(timing);
    this._variation.materializeAgainstTiming(timing);
  }

  private _getGeneratedFit() {
    const unfit = this._pitches.hasAuthoredValues || this._chop || this._region;
    if (unfit) return null;
    return this._fit;
  }

  private _getTimingOverride() {
    if (this._chop) {
      return getChopTiming(this._chop, this._fit?.bars ?? 1);
    }

    const generatedFit = this._getGeneratedFit();
    return generatedFit
      ? getDistributedTiming(generatedFit.bars, generatedFit.bars)
      : undefined;
  }

  private _getEventPattern(sampleNames: AuthoredEventValues<string>) {
    return compileSamplerEvents({
      pitches: this._pitches,
      timing: this._timing,
      variation: this._variation,
      timingOverride: this._getTimingOverride(),
      sampleNames,
    });
  }

  private _warnForMissingSource(sampleNames: AuthoredEventValues<string>) {
    if (!this._host) return;
    const bank = this._host._resolveBank(this._bank);
    if (!bank) {
      console.warn(
        `[Sampler] Bank "${this._bank}" not found — did you forget to call loadSamples()? This sampler may not produce audio.`,
      );
      return;
    }
    if (sampleNames.source.type === "random") return;
    const names = new Set(
      sampleNames.source.cycle.flatMap((bar) =>
        bar.flatMap((group) => group ?? []),
      ),
    );
    for (const sampleName of names) {
      if (!bank.samples[sampleName]) {
        console.warn(
          `[Sampler] Sample "${sampleName}" not found in bank "${this._bank}". This sampler may not produce audio.`,
        );
      }
    }
  }

  private _requireSampleNames() {
    if (!this._sampleNames) {
      throw new Error("[Sampler] sample name is required before getSchema().");
    }
    return this._sampleNames;
  }

  getSchema(): SamplerSchema {
    const sampleNames = this._requireSampleNames();
    const eventPattern = this._getEventPattern(sampleNames);
    this._warnForMissingSource(sampleNames);
    const region = getRegion({
      fitSchema: this._getGeneratedFit(),
      chopState: this._chop,
      chopBars: this._fit?.bars ?? 1,
      region: this._region,
    });

    return {
      type: "sampler",
      bank: this._bank,
      eventPattern,
      fit: this._fit,
      region,
      detune: this._detune.getSchema("detune"),
      gain: this._gain.getSchema(),
      effects: this._effects.map((e) => e.getSchema()),
      muted: this._muted,
      route: this._route,
      sends: Object.fromEntries(this._sends),
      loop: this._loop,
      clipMode: this._clipMode,
      direction: this._direction,
    };
  }
}

export default Sampler;
