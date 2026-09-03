import PatternCycle from "./pattern-cycle";
import type { StaticValuePattern, TimingSchema, TimingStep } from "./types";

class BinaryCycle extends PatternCycle<1 | 0> {
  constructor() {
    super([1], 0);
  }

  getTimingSchema() {
    const cycle = this._cycle.map((pattern) => {
      if (pattern.length === 0) return [];

      const duration = 1 / pattern.length;

      return pattern.reduce<TimingStep[]>((steps, value, index) => {
        if (value === 1) {
          steps.push({ duration, offset: duration * index });
        }
        return steps;
      }, []);
    });

    return { cycle } satisfies TimingSchema;
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

    return { type: "static", cycle } satisfies StaticValuePattern<number>;
  }
}

export { BinaryCycle, ValueCycle };
