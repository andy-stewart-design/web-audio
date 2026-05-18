import type { Chord } from "@web-audio/patterns";
import { noteStringToMidi } from "@/utils/note-string-to-midi";
import type { NoteName, NoteValue, ScaleAlias } from "@/types";
import type {
  ParameterSchema,
  RandomSchema,
  StaticSchema,
} from "@web-audio/schema";
import MidiNotes from "./midi-notes";

const DEFAULT_ROOT = 69; // A4

class SampleNotes extends MidiNotes {
  private _rootMidi = DEFAULT_ROOT;

  constructor(defaultPattern: Chord) {
    super(defaultPattern);
    super.root(DEFAULT_ROOT);
  }

  root(n: NoteName | NoteValue | number) {
    this._rootMidi =
      typeof n === "number" ? n : (noteStringToMidi(n) ?? DEFAULT_ROOT);
    return super.root(n);
  }

  scale(name: ScaleAlias) {
    return super.scale(name);
  }

  getSchema(): ParameterSchema {
    return this._remapToPlaybackRate(super.getSchema());
  }

  private _midiToRate(midi: number): number {
    return Math.pow(2, (midi - this._rootMidi) / 12);
  }

  private _remapToPlaybackRate(
    schema: StaticSchema | RandomSchema,
  ): ParameterSchema {
    if (schema.type === "static") {
      return {
        ...schema,
        cycle: schema.cycle.map((bar) =>
          bar.map((step) => ({ ...step, value: this._midiToRate(step.value) })),
        ),
      };
    }

    if (schema.valueMap) {
      return {
        ...schema,
        valueMap: schema.valueMap.map((v) => this._midiToRate(v)),
      };
    }

    // No valueMap — build one from the range so the engine gets rates, not MIDI integers
    const min = Math.floor(schema.range?.min ?? DEFAULT_ROOT);
    const max = Math.ceil(schema.range?.max ?? DEFAULT_ROOT + 12);
    const valueMap = Array.from({ length: max - min }, (_, i) =>
      this._midiToRate(i + min),
    );
    return { ...schema, valueMap, range: undefined };
  }
}

export default SampleNotes;
