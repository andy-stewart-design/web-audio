import type { RandomCycle, Shorthand } from "@web-audio/patterns";

type ShorthandInput = string | Shorthand;
type CycleInput<T> = (T | T[])[] | [RandomCycle];
type NumericPatternInput = CycleInput<number> | [ShorthandInput];
type StaticNullableCycleInput<T> = (T | null | (T | null | T[])[])[];
type NullableCycleInput<T> = StaticNullableCycleInput<T> | [RandomCycle];

export type {
  CycleInput,
  NumericPatternInput,
  ShorthandInput,
  StaticNullableCycleInput,
  NullableCycleInput,
};
