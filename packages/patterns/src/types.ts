// Generic cycle utilities parameterized over a "step" type S.
// Flat arrays use S = T, nested arrays use S = T | T[].

type NoteInput<S> = S | S[];
type Cycle<S> = S[][];

type Nullable<T> = T | null | undefined;
type ScheduledValue = Nullable<number>;
type Chord = Nullable<ScheduledValue[]>;

interface StaticSchemaValue {
  value: number;
  startOffset: number;
  duration: number;
}

interface RandomSchema {
  type: "float" | "integer" | "binary";
  segments: { seed: number; len?: number }[];
  quantValue: number | undefined;
  range: { min: number; max: number } | undefined;
  algorithm: "xor" | "mulberry";
  maskCycle: StaticSchemaValue[][];
}

export type {
  NoteInput,
  Cycle,
  StaticSchemaValue,
  RandomSchema,
  Nullable,
  ScheduledValue,
  Chord,
};
