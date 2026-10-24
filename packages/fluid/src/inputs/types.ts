import type {
  RandomCycle,
  Shorthand,
  StructuredInput,
} from "@web-audio/patterns";
import type Envelope from "@/automations/envelope";
import type Lfo from "@/automations/lfo";
import type { MidiCc } from "@/midi/builders";

type ShorthandInput = string | Shorthand;
type CycleInput<T> = (T | T[])[] | [RandomCycle];
type NumericPatternValue =
  | number
  | ShorthandInput
  | RandomCycle
  | StructuredInput<number>;
type NumericPatternInput =
  | CycleInput<number>
  | [ShorthandInput]
  | [StructuredInput<number>];
type ADSRInput = number | ShorthandInput | StructuredInput<number>;
type SingleSlotAudioParamInput = NumericPatternValue | Envelope | Lfo | MidiCc;
type StructuredNotesInput = StructuredInput<number | null>;
type StructuredNamesInput = StructuredInput<string | null>;
type StructuredVariationInput = StructuredInput<number | null>;
type StructuredXoxInput = StructuredInput<number>;
type StaticNullableCycleInput<T> = (T | null | (T | null | T[])[])[];
type NullableCycleInput<T> = StaticNullableCycleInput<T> | [RandomCycle];

export type {
  CycleInput,
  NumericPatternInput,
  NumericPatternValue,
  SingleSlotAudioParamInput,
  ADSRInput,
  ShorthandInput,
  StaticNullableCycleInput,
  NullableCycleInput,
  StructuredNotesInput,
  StructuredNamesInput,
  StructuredVariationInput,
  StructuredXoxInput,
};
