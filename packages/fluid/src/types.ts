import Synthesizer from "./instruments/synthesizer";
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

type Waveform = Exclude<OscillatorType, "custom">;
type SynthesizerSchema = ReturnType<typeof Synthesizer.prototype.getSchema>;

export type { SynthesizerSchema, Waveform, ScaleAlias, NoteName, NoteValue };
