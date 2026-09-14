import PatternCycle from "./pattern-cycle";
import compileTimingCycle from "./utils/compile-timing-cycle";
import type { StaticPattern } from "./types";

class BinaryCycle extends PatternCycle<1 | 0> {
  constructor() {
    super([1], 0);
  }

  getTimingPattern() {
    return compileTimingCycle(this._cycle);
  }
}

class ValueCycle extends PatternCycle<number> {
  constructor(defaultPattern: number[], nullValue: number) {
    super(defaultPattern, nullValue);
  }

  getStaticSchema() {
    const cycle = this._cycle.map((pattern, barIndex) => {
      if (pattern.length === 0) {
        throw new Error(
          `[Pattern] ValueCycle cannot serialize an empty bar at cycle[${barIndex}].`,
        );
      }
      if (pattern.some((value) => !Number.isFinite(value))) {
        throw new Error(
          `[Pattern] ValueCycle cycle[${barIndex}] must contain only finite numbers.`,
        );
      }
      return [...pattern];
    });

    return { type: "static", cycle } satisfies StaticPattern<number>;
  }
}

export { BinaryCycle, ValueCycle };
