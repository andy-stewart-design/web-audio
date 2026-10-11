import type { ScaleAlias } from "./get-scale";
import type { KeyNotation, NoteValue } from "./types";

function parseKey(notation: KeyNotation) {
  const match = notation.match(/^([A-Ga-g][#b]?-?\d+)([a-z]+)$/);
  if (!match) throw new Error(`[Instrument] key() cannot parse "${notation}".`);

  return { root: match[1] as NoteValue, scale: match[2] as ScaleAlias };
}

export { parseKey };
