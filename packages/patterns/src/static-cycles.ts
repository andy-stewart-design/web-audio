import PatternCycle from "./pattern-cycle";
import type { StaticSchema, StaticSchemaValue } from "./types";

class BinaryCycle extends PatternCycle<1 | 0> {
  constructor() {
    super([1], 0);
  }

  getStaticSchema() {
    const cycle = this._cycle.map((pattern) => {
      if (pattern.length === 0) return [];

      const duration = 1 / pattern.length;

      return pattern.reduce<StaticSchemaValue[]>((acc, value, i) => {
        if (value === 1) {
          acc.push({ value, duration, offset: duration * i, stepIndex: i });
        }
        return acc;
      }, []);
    });

    return { type: "static", polyphonic: false, cycle } satisfies StaticSchema;
  }
}

class ValueCycle extends PatternCycle<number> {
  constructor(defaultPatern: number[], nullValue: number) {
    super(defaultPatern, nullValue);
  }

  getStaticSchema() {
    const cycle = this._cycle.map((pattern) => {
      const duration = 1 / pattern.length;

      return pattern.reduce<StaticSchemaValue[]>((acc, value, i) => {
        acc.push({ value, duration, offset: duration * i, stepIndex: i });
        return acc;
      }, []);
    });

    return { type: "static", polyphonic: false, cycle } satisfies StaticSchema;
  }
}

export { BinaryCycle, ValueCycle };
