type NoteInput<S> = S | S[];
type Pattern<S> = S[];
type Cycle<S> = Pattern<S>[];
type BinaryCycleData = Cycle<0 | 1>;

type Nullable<T> = T | null | undefined;
type ScheduledValue = Nullable<number>;

export type { NoteInput, Cycle, BinaryCycleData, ScheduledValue };
