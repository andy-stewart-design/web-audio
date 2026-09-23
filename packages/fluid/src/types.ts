export type {
  DromeSchema,
  EnvelopeSchema,
  SynthesizerSchema,
  Waveform,
} from "@web-audio/schema";
import type { RandomCycle } from "@web-audio/patterns";
import type Envelope from "./automations/envelope";
import type Lfo from "./automations/lfo";
import type { MidiCc } from "./midi";
import type Parameter from "./patterns/parameter";
import type { scaleAliasMap } from "./utils/get-scale";

type CycleInput<T> = (T | T[])[] | [RandomCycle];
type StaticNullableCycleInput<T> = (T | null | (T | null | T[])[])[];
type NullableCycleInput<T> = StaticNullableCycleInput<T> | [RandomCycle];

type AudioParamSource = Parameter | Envelope | Lfo | MidiCc;
type AudioParamInput = CycleInput<number> | [Envelope] | [Lfo] | [MidiCc];

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
type BankedSampleBank = { bank: string; samples: SampleBank; baseUrl?: string };
type SpriteRegion = [number, number];
type SpriteLeaf = SpriteRegion[];
type Banked<T> = T & { bank: string };
type SpriteBank<S> = { src: string; samples: S; baseUrl?: string };
type SpriteSampleBank = SpriteBank<Record<string, SpriteLeaf>>;
type PitchedSpriteSampleBank = SpriteBank<
  Record<string, Record<string, SpriteLeaf>>
>;
type MultiSampleValue = string[] | Record<string, string[]>;
type MultiSampleBank = {
  samples: Record<string, MultiSampleValue>;
  baseUrl?: string;
};
type LoadSamplesInput =
  | SampleBank
  | BankedSampleBank
  | SpriteSampleBank
  | Banked<SpriteSampleBank>
  | PitchedSpriteSampleBank
  | Banked<PitchedSpriteSampleBank>
  | MultiSampleBank
  | Banked<MultiSampleBank>;

export type {
  ADSR,
  AudioParamInput,
  AudioParamSource,
  CycleInput,
  NullableCycleInput,
  StaticNullableCycleInput,
  ScaleAlias,
  NoteName,
  NoteValue,
  SampleBank,
  BankedSampleBank,
  SpriteRegion,
  SpriteLeaf,
  Banked,
  SpriteBank,
  SpriteSampleBank,
  PitchedSpriteSampleBank,
  MultiSampleBank,
  LoadSamplesInput,
};
