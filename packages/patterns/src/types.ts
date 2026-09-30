// Schema types — re-exported from @web-audio/schema
export type {
  ChanceCondition,
  RandomNumberPattern,
  StaticNotePattern,
  StaticPattern,
  TimingPattern,
  TimingStep,
} from "@web-audio/schema";

// Shared input-boundary expression types — owned by this package
export type {
  PatternExpression,
  PatternNode,
  PatternRange,
  PatternAtom,
  PatternRest,
  PatternSequence,
  PatternGroup,
  PatternParallel,
  PatternAlternate,
  PatternModifier,
} from "./pattern-expression";

// Canonical event-cycle types — internal package integration, not a user API
export type {
  NonEmptyGroup,
  EventCycle,
  StaticEventCycle,
  RandomEventCycle,
  RandomEventSettings,
  EventPattern,
  EventStep,
} from "./event-cycle";

// Internal pattern types — owned by this package
type NoteInput<S> = S | S[];
type Pattern<S> = S[];
type Cycle<S> = Pattern<S>[];
type BinaryCycleData = Cycle<0 | 1>;

interface SourceHitReference {
  sourceBarIndex: number;
  sourceHitIndex: number;
}

type Nullable<T> = T | null | undefined;
type ScheduledValue = Nullable<number>;
type Chord = Nullable<ScheduledValue[]>;

export type {
  NoteInput,
  Pattern,
  Cycle,
  BinaryCycleData,
  SourceHitReference,
  Nullable,
  ScheduledValue,
  Chord,
};
