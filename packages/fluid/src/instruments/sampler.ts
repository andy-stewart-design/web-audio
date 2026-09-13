import SampleNotes from "@/patterns/sample-notes";
import Parameter from "@/patterns/parameter";
import type { CycleInput } from "@/types";
import type {
  ClipMode,
  FitSchema,
  SampleDirection,
  SamplerEventSchema,
  SamplerSchema,
} from "@web-audio/schema";
import {
  alignSamplerEventCycles,
  getChopTiming,
  getDistributedTiming,
  getRegion,
  getVariationIndices,
  type ChopState,
  type RegionState,
} from "./sampler-utils";
import { DEFAULT_BANK } from "@/banks";
import Instrument from "./instrument";
import type Drome from "@/index";

interface SamplerOptions {
  bank?: string;
  host?: Drome;
}

type SampleDirectionInput = SampleDirection | "for" | "rev" | "alt";

class Sampler extends Instrument {
  private _bank: string;
  private _sample: string;
  private _variation: Parameter;
  private _fit: FitSchema | null = null;
  private _region: RegionState | null = null;
  private _chop: ChopState | null = null;
  // Pitch intent controls optional note output; only explicit notes may filter timing.
  private _explicitNotes = false;
  private _pitchIntent = false;
  private _loop = false;
  private _clipMode: ClipMode = "clipped";
  private _direction: SampleDirection = "forward";

  dur: (...input: CycleInput) => this;
  dir: (direction: SampleDirectionInput) => this;

  constructor(
    sample: string,
    { bank = DEFAULT_BANK, host }: SamplerOptions = {},
  ) {
    super([0], host, { a: 0.0025, r: 0.005 });
    this._cycle = new SampleNotes([0]);
    this._bank = bank;
    this._sample = sample;
    this._variation = new Parameter(0);
    this.dur = this.duration.bind(this);
    this.dir = this.direction.bind(this);
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
    this._pitchIntent = true;
    return super.notes(...input);
  }

  root(...input: Parameters<Instrument["root"]>) {
    this._pitchIntent = true;
    return super.root(...input);
  }

  scale(...input: Parameters<Instrument["scale"]>) {
    this._pitchIntent = true;
    return super.scale(...input);
  }

  start(...input: CycleInput) {
    const start = new Parameter(...input);
    this._region = this._region
      ? { ...this._region, start }
      : { start, mode: "end", end: null };
    return this;
  }

  end(...input: CycleInput) {
    this._region = {
      start: this._region?.start ?? null,
      mode: "end",
      end: new Parameter(...input),
    };
    return this;
  }

  duration(...input: CycleInput) {
    this._region = {
      start: this._region?.start ?? null,
      mode: "duration",
      duration: new Parameter(...input),
    };
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

  private _getGeneratedFit() {
    const unfit = this._explicitNotes || this._chop || this._region;
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

  private _getEvents(): SamplerEventSchema {
    const timingOverride = this._getTimingOverride();
    const noteEvents = this._cycle.getEvents(timingOverride);
    const variationIndices = getVariationIndices(this._variation);

    return alignSamplerEventCycles({
      timing:
        timingOverride && !this._explicitNotes
          ? timingOverride
          : noteEvents.timing,
      sampleNames: { type: "static", cycle: [[[this._sample]]] },
      notes: this._pitchIntent ? noteEvents.notes : undefined,
      variationIndices,
      notesFilterTiming: this._explicitNotes,
    });
  }

  private _warnForMissingSource() {
    if (!this._host) return;
    const bank = this._host._resolveBank(this._bank);
    if (!bank) {
      console.warn(
        `[Sampler] Bank "${this._bank}" not found — did you forget to call loadSamples()? This sampler may not produce audio.`,
      );
      return;
    }
    if (!bank.samples[this._sample]) {
      console.warn(
        `[Sampler] Sample "${this._sample}" not found in bank "${this._bank}". This sampler may not produce audio.`,
      );
    }
  }

  getSchema(): SamplerSchema {
    this._warnForMissingSource();
    const region = getRegion({
      fitSchema: this._getGeneratedFit(),
      chopState: this._chop,
      chopBars: this._fit?.bars ?? 1,
      region: this._region,
    });

    return {
      type: "sampler",
      bank: this._bank,
      events: this._getEvents(),
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
