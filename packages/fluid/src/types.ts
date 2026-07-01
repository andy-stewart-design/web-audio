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
type SpriteRegion = [number, number];
type SpriteLeaf = SpriteRegion[];
type Named<T> = T & { name: string };
type SpriteBank<S> = { sprite: string; samples: S };
type SpriteSampleBank = SpriteBank<Record<string, SpriteLeaf>>;
type PitchedSpriteSampleBank = SpriteBank<
  Record<string, Record<string, SpriteLeaf>>
>;
type MultiSampleBank = { samples: Record<string, Record<string, string[]>> };
type LoadSamplesInput =
  | SampleBank
  | NamedSampleBank
  | SpriteSampleBank
  | Named<SpriteSampleBank>
  | PitchedSpriteSampleBank
  | Named<PitchedSpriteSampleBank>
  | MultiSampleBank
  | Named<MultiSampleBank>;

export type {
  ADSR,
  CycleInput,
  ScaleAlias,
  NoteName,
  NoteValue,
  SampleBank,
  NamedSampleBank,
  SpriteRegion,
  SpriteLeaf,
  Named,
  SpriteBank,
  SpriteSampleBank,
  PitchedSpriteSampleBank,
  MultiSampleBank,
  LoadSamplesInput,
};
