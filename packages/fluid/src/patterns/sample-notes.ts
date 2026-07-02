import type { Chord } from "@web-audio/patterns";
import type { NoteName, NoteValue, ScaleAlias } from "@/types";
import MidiNotes from "./midi-notes";

const DEFAULT_ROOT = 0;

class SampleNotes extends MidiNotes {
  constructor(defaultPattern: Chord) {
    super(defaultPattern);
    super.root(DEFAULT_ROOT);
  }

  root(n: NoteName | NoteValue | number) {
    return super.root(n);
  }

  scale(name: ScaleAlias) {
    return super.scale(name);
  }
}

export default SampleNotes;
