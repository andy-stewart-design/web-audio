export type {
  DromeSchema,
  EnvelopeSchema,
  SynthesizerSchema,
  Waveform,
} from "@web-audio/schema";
import type { RandomCycle } from "@web-audio/patterns";
import type { scaleAliasMap } from "./utils/get-scale";

type CycleInput = (number | number[])[] | [RandomCycle];

type ADSR = { a: number; d: number; s: number; r: number };

type ScaleAlias = keyof typeof scaleAliasMap;

type NaturalNote = "A" | "B" | "C" | "D" | "E" | "F" | "G";
type Accidental = "#" | "b";
type AccidentalNote = Exclude<
  `${NaturalNote}${Accidental}`,
  "B#" | "Cb" | "E#" | "Fb"
>;
type NoteNameUpper = NaturalNote | AccidentalNote;
type NoteName = NoteNameUpper | Lowercase<NoteNameUpper>;
type NoteValue = `${NoteName}${number}`;

type SampleBank = Record<string, string[]>;
type NamedSampleBank = { name: string; samples: SampleBank };

export type {
  ADSR,
  CycleInput,
  ScaleAlias,
  NoteName,
  NoteValue,
  SampleBank,
  NamedSampleBank,
};
