// Schema types — re-exported from @web-audio/schema
export type {
  StaticSchema,
  StaticSchemaValue,
  RandomSchema,
} from "@web-audio/schema";

// Internal pattern types — owned by this package
type NoteInput<S> = S | S[];
type Cycle<S> = S[][];

type Nullable<T> = T | null | undefined;
type ScheduledValue = Nullable<number>;
type Chord = Nullable<ScheduledValue[]>;

export type { NoteInput, Cycle, Nullable, ScheduledValue, Chord };
