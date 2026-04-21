export type {
  DromeSchema,
  EnvelopeSchema,
  SynthesizerSchema,
  Waveform,
} from "@web-audio/schema";

import type { RandomCycle } from "@web-audio/patterns";

type CycleInput = (number | number[])[] | [RandomCycle];

export type { CycleInput };

import type { scaleAliasMap } from "./utils/get-scale";

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

export type { ScaleAlias, NoteName, NoteValue };
