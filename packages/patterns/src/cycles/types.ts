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
  Cycle,
  BinaryCycleData,
  SourceHitReference,
  ScheduledValue,
  Chord,
};
