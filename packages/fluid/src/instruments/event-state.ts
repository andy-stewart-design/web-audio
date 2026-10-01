import type {
  EventCycle,
  NonEmptyGroup,
  StaticEventCycle,
} from "@web-audio/patterns";
import type { TimingChanceCondition } from "@/types";

/** A static default keeps fallback values independent from its timing geometry. */
type DefaultEventSource<T> = {
  readonly intent: "default";
  readonly fallback: NonEmptyGroup<T>;
  readonly cycle: StaticEventCycle<T>;
};

/** Authored numeric lanes may retain random generation rather than static values. */
type EventSource<T> =
  | DefaultEventSource<T>
  | { readonly intent: "authored"; readonly cycle: EventCycle<T> };

/** Sample names cannot be random; authored and default intent still differ. */
type StaticEventSource<T> =
  | DefaultEventSource<T>
  | { readonly intent: "authored"; readonly cycle: StaticEventCycle<T> };

/** Chance belongs to timing, never to a numeric value lane's generation settings. */
type TimingState = {
  readonly intent: "implicit" | "explicit";
  readonly cycle: StaticEventCycle<1>;
  readonly condition?: TimingChanceCondition;
};

/** Resolved pitch data; conversion to MIDI belongs to compilation, not this model. */
type PitchState = {
  readonly root: number;
  readonly scale?: readonly number[];
  // root(0) still requests sampler notes, so intent cannot be derived from values.
  readonly hasRequestedTransform: boolean;
};

/** Readonly contracts only; native constructors and transitions will freeze snapshots. */
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

/** Generated chop/fit timing is a compiler input, never persistent event state. */
type SamplerEventCompilerInput = {
  readonly state: SamplerEventState;
  readonly timingOverride?: StaticEventCycle<1>;
};

export type {
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
