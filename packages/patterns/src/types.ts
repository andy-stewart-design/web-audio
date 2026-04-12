// Generic cycle utilities parameterized over a "step" type S.
// Flat arrays use S = T, nested arrays use S = T | T[].

export type NoteInput<S> = S | S[];
export type Cycle<S> = S[][];
export type nullableNumber = number | null | undefined;
