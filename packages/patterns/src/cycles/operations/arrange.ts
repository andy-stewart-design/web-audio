import type { NoteInput, Cycle } from "../types";

export function arrange<S>(...patterns: [number, NoteInput<S>][]) {
  const nextCycle: Cycle<S> = [];

  for (const [numLoops, pattern] of patterns) {
    for (let i = 0; i < numLoops; i++) {
      nextCycle.push(Array.isArray(pattern) ? pattern : [pattern]);
    }
  }

  return nextCycle;
}
