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
  chordIndex?: number;
}

interface StaticSchema {
  type: "static";
  nested: boolean;
  cycle: StaticSchemaValue[][];
}

interface RandomSchema {
  type: "random";
  dataType: "float" | "integer" | "binary";
  segments: { seed: number; len?: number }[];
  quantValue: number | undefined;
  range: { min: number; max: number } | undefined;
  algorithm: "xor" | "mulberry";
  cycle: StaticSchema;
}

export type {
  NoteInput,
  Cycle,
  StaticSchema,
  StaticSchemaValue,
  RandomSchema,
  Nullable,
  ScheduledValue,
  Chord,
};
