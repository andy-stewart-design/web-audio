import type { NoteInput } from "../types";

export function pattern<S>(...patterns: NoteInput<S>[]) {
  return patterns.map((p) => (Array.isArray(p) ? p : [p]));
}
