import type { RandomCycle } from "@web-audio/patterns";

type CycleInput<T> = (T | T[])[] | [RandomCycle];
type StaticNullableCycleInput<T> = (T | null | (T | null | T[])[])[];
type NullableCycleInput<T> = StaticNullableCycleInput<T> | [RandomCycle];

export type { CycleInput, StaticNullableCycleInput, NullableCycleInput };
