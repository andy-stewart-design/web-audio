import PatternCycle from "./pattern-cycle";
import compileTimingCycle from "./utils/compile-timing-cycle";
import type { BinaryCycleData } from "./types";

class FixedTimingCycle extends PatternCycle<1 | 0> {
  constructor(cycle: BinaryCycleData = [[1]]) {
    super([1], 0);
    this.replace(cycle.map((bar) => [...bar]));
  }

  getTimingPattern() {
    return compileTimingCycle(this._cycle);
  }
}

export default FixedTimingCycle;
