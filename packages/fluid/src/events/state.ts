import type {
  EventCycle,
  NonEmptyGroup,
  StaticEventCycle,
} from "@web-audio/patterns";
import type { TimingStep } from "@web-audio/schema";
import type { TimingChanceCondition } from "@/types";

/** Authored false values and inherited timing gaps remain distinct through transforms. */
type LaneAvailability = {
  readonly intent: "authored" | "aligned";
  readonly cycle: StaticEventCycle<boolean | "timing-gap">;
  readonly zeroWidthPatterns?: readonly boolean[];
};

type SourceProvenance = {
  readonly availability?: LaneAvailability;
  readonly zeroWidthPatterns?: readonly boolean[];
  // Structured note rests are empty-chord value slots; transformed gaps are not.
  readonly noteValueSlots?: StaticEventCycle<1>;
  // Legacy notes exempt an original one-slot source even after its grid changes.
  readonly materializationExempt?: boolean;
  // Immutable identity links lanes whose intersection is already in selected timing.
  readonly materializedTiming?: symbol;
};

/** A static default keeps fallback values independent from its timing geometry. */
type DefaultEventSource<T> = {
  readonly intent: "default";
  readonly fallback: NonEmptyGroup<T>;
  readonly cycle: StaticEventCycle<T>;
};

/** Authored numeric lanes may retain random generation rather than static values. */
type EventSource<T> =
  | DefaultEventSource<T>
  | ({
      readonly intent: "authored";
      readonly cycle: EventCycle<T>;
    } & SourceProvenance);

/** Sample names cannot be random; authored and default intent still differ. */
type StaticEventSource<T> =
  | DefaultEventSource<T>
  | ({
      readonly intent: "authored";
      readonly cycle: StaticEventCycle<T>;
    } & SourceProvenance);

/** Chance belongs to timing, never to a numeric value lane's generation settings. */
type TimingState = {
  readonly intent: "implicit" | "explicit";
  readonly cycle: StaticEventCycle<1>;
  readonly zeroWidthPatterns?: readonly boolean[];
  readonly condition?: TimingChanceCondition;
};

/** Resolved pitch data; conversion to MIDI belongs to compilation, not this model. */
type PitchState = {
  readonly root: number;
  readonly scale?: readonly number[];
  // root(0) still requests sampler notes, so intent cannot be derived from values.
  readonly hasRequestedTransform: boolean;
};

/** Native constructors and transitions produce frozen snapshots of these contracts. */
type SynthEventState = {
  readonly type: "synth";
  readonly notes: EventSource<number>;
  readonly pitch: PitchState;
  readonly timing: TimingState;
};

type SamplerEventState = {
  readonly type: "sampler";
  readonly notes: EventSource<number>;
  readonly pitch: PitchState;
  readonly sampleNames?: StaticEventSource<string>;
  readonly variation: EventSource<number>;
  readonly timing: TimingState;
};

type InstrumentEventState = SynthEventState | SamplerEventState;

/** Generated gates may cross bars; preserve existing schema geometry outside v1 IR. */
type GeneratedTimingOverride = {
  readonly cycle: readonly (readonly Readonly<TimingStep>[])[];
};

/** Generated chop/fit timing is a compiler input, never persistent event state. */
type SamplerEventCompilerInput = {
  readonly state: SamplerEventState;
  readonly timingOverride?: GeneratedTimingOverride;
};

export type {
  LaneAvailability,
  SourceProvenance,
  GeneratedTimingOverride,
  DefaultEventSource,
  EventSource,
  StaticEventSource,
  TimingState,
  PitchState,
  SynthEventState,
  SamplerEventState,
  InstrumentEventState,
  SamplerEventCompilerInput,
};
