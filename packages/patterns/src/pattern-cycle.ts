import BaseCycle from "./base-cycle";
import { arrange, pattern, type NoteInput, type Cycle } from "./utils";

class PatternCycle<T> extends BaseCycle<T> {
  constructor(input: NoteInput<T>, nullValue: T) {
    const cycle = Array.isArray(input) ? [input] : [[input]];
    super(cycle, nullValue);
  }

  /* ----------------------------------------------------------------
  /* PATTERN SETTERS
  ---------------------------------------------------------------- */
  pattern(...patterns: NoteInput<T>[]) {
    this._cycle = pattern(...patterns);
    return this;
  }

  arrange(...input: [number, NoteInput<T>][]) {
    this._cycle = arrange(...input);
    return this;
  }

  replace(cycle: Cycle<T>) {
    this._cycle = cycle;
  }
}

export default PatternCycle;
