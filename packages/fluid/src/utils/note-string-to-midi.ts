import type { NoteName, NoteValue } from "../types";

// prettier-ignore
const noteNames: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3,
  E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8,
  Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

function noteToMidi(noteString: NoteName | NoteValue) {
  const match = noteString.match(/([CDEFGAB][#b]?)(-?\d+)?/i);
  if (!match) return null;

  const noteName = match[1].toLocaleUpperCase();
  const octave = parseInt(match[2] || "5", 10);
  const baseValue = noteNames[noteName];

  if (baseValue === undefined) return null;
  // Calculate MIDI number: A2: (2 + 1) * 12 + 9 = 45.
  // (Octave + 1) * 12 gives the base MIDI number for the octave's C note.
  // Adding the note's base value gives the final MIDI number.
  return (octave + 1) * 12 + baseValue;
}

export { noteToMidi };
