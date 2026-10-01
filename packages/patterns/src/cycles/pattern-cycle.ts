import BaseCycle from "./base-cycle";
import { arrange } from "./operations/arrange";
import { pattern } from "./operations/pattern";
import type { NoteInput, Cycle } from "./types";

class PatternCycle<T> extends BaseCycle<T> {
  constructor(input: NoteInput<T>, nullValue: T) {
    const cycle = Array.isArray(input) ? [input] : [[input]];
    super(cycle, nullValue);
  }

  /* ----------------------------------------------------------------
  /* PATTERN SETTERS
  ---------------------------------------------------------------- */
  pattern(...patterns: NoteInput<T>[]) {
    this.replaceCycle(pattern(...patterns));
    return this;
  }

  arrange(...input: [number, NoteInput<T>][]) {
    this.replaceCycle(arrange(...input));
    return this;
  }

  replace(cycle: Cycle<T>) {
    this.replaceCycle(cycle);
  }
}

export default PatternCycle;
