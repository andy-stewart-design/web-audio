import type { EventCycleTransform } from "@web-audio/patterns";
import type { SamplerEventState, StaticEventSource } from "@/events/state";
import {
  createSamplerEventState,
  replaceSampleNames,
  replaceEventVariation,
  transformEventState,
} from "@/events/transitions";
import { compileSamplerEventState } from "@/events/compiler";
import {
  decodeSampleNamesInput,
  decodeVariationsInputGeometry,
} from "@/inputs/decode-structured-input";
import Parameter from "@/parameters/parameter";
import type {
  CycleInput,
  NullableCycleInput,
  StaticNullableCycleInput,
} from "@/inputs/types";
import type {
  ClipMode,
  FitSchema,
  SampleDirection,
  SamplerSchema,
} from "@web-audio/schema";
import { getRegion, type ChopState, type RegionState } from "./sampler-utils";
import {
  getGeneratedSamplerTiming,
  setSamplerEventFit,
  setSamplerEventChop,
} from "./sampler-event-timing";
import { DEFAULT_BANK } from "@/samples/built-in-banks";
import Instrument from "./instrument";
import type Drome from "@/drome";
import { normalizeBankName } from "@/samples/normalize-bank";

interface SamplerOptions {
  bank?: string;
  host?: Drome;
}

type SampleDirectionInput = SampleDirection | "for" | "rev" | "alt";

class Sampler extends Instrument {
  private _bank: string;
  protected _eventState: SamplerEventState;
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
    super(host, { a: 0.0025, r: 0.005 });
    this._eventState = createSamplerEventState(sample);
    this._bank = normalizeBankName(bank);
    this.dur = this.duration.bind(this);
    this.dir = this.direction.bind(this);
  }

  // METHOD ALIASES
  var(...input: NullableCycleInput<number>) {
    return this.variation(...input);
  }

  // INSTANCE METHODS
  name(...input: StaticNullableCycleInput<string>) {
    this._eventState = replaceSampleNames(
      this._eventState,
      decodeSampleNamesInput(input),
    );
    return this;
  }

  bank(name: string) {
    this._bank = normalizeBankName(name);
    return this;
  }

  variation(...input: NullableCycleInput<number>) {
    const decoded = decodeVariationsInputGeometry(input);
    this._eventState = replaceEventVariation(
      this._eventState,
      decoded.cycle,
      decoded.zeroWidthPatterns,
    );
    return this;
  }

  fit(bars: number) {
    const result = setSamplerEventFit(
      this._eventState,
      this._getTimingConfiguration(),
      bars,
    );
    this._eventState = result.state;
    this._fit = { type: "fit", bars: result.configuration.fitBars };
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
    const result = setSamplerEventChop(
      this._eventState,
      this._getTimingConfiguration(),
      sliceCount,
      ...sequence,
    );
    this._eventState = result.state;
    this._chop = result.configuration.chop;
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

  protected override _transformEvents(operation: EventCycleTransform) {
    this._eventState = transformEventState(this._eventState, operation, {
      timingOverride: this._getTimingOverride(),
    });
  }

  private _getTimingConfiguration() {
    return {
      fitBars: this._fit?.bars,
      chop: this._chop ?? undefined,
      hasRegion: this._region !== null,
    };
  }

  private _getGeneratedFit() {
    const unfit =
      this._eventState.notes.intent === "authored" ||
      this._chop ||
      this._region;
    if (unfit) return null;
    return this._fit;
  }

  private _getTimingOverride() {
    return getGeneratedSamplerTiming(
      this._eventState,
      this._getTimingConfiguration(),
    );
  }

  private _warnForMissingSource(sampleNames: StaticEventSource<string>) {
    if (!this._host) return;
    const bank = this._host._resolveBank(this._bank);
    if (!bank) {
      console.warn(
        `[Sampler] Bank "${this._bank}" not found — did you forget to call loadSamples()? This sampler may not produce audio.`,
      );
      return;
    }
    const names = new Set(
      sampleNames.intent === "default"
        ? sampleNames.fallback
        : sampleNames.cycle.patterns.flatMap((bar) =>
            bar.flatMap((step) => (step.type === "event" ? step.values : [])),
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
    if (!this._eventState.sampleNames) {
      throw new Error("[Sampler] sample name is required before getSchema().");
    }
    return this._eventState.sampleNames;
  }

  getSchema(): SamplerSchema {
    const sampleNames = this._requireSampleNames();
    const eventPattern = compileSamplerEventState(this._eventState, {
      timingOverride: this._getTimingOverride(),
    });
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
