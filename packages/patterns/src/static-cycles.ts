import PatternCycle from "./pattern-cycle";
import type { Chord, StaticSchema, StaticSchemaValue } from "./types";

class BinaryCycle extends PatternCycle<1 | 0> {
  constructor() {
    super([1], 0);
  }

  getStaticSchema() {
    const cycle = this._cycle.map((pattern) => {
      const duration = 1 / pattern.length;

      return pattern.reduce<StaticSchemaValue[]>((acc, value, i) => {
        if (value === 1) {
          acc.push({ value, duration, startOffset: duration * i });
        }
        return acc;
      }, []);
    });

    return { type: "static", nested: false, cycle } satisfies StaticSchema;
  }
}

class ChordCycle extends PatternCycle<Chord> {
  constructor(defaultPatern: Chord) {
    super(defaultPatern, null);
  }

  getStaticSchema(transformer?: (v: number) => number) {
    const cycle = this._cycle.map((pattern) => {
      const stepDuration = 1 / pattern.length;

      return pattern.flatMap((chord, chordIdx) =>
        (chord ?? [])
          .filter((v) => typeof v === "number")
          .map((value) => ({
            value: transformer ? transformer(value) : value,
            startOffset: stepDuration * chordIdx,
            duration: stepDuration,
            chordIndex: chordIdx,
          })),
      );
    });

    return { type: "static", nested: true, cycle } satisfies StaticSchema;
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
        acc.push({ value, duration, startOffset: duration * i });
        return acc;
      }, []);
    });

    return { type: "static", nested: false, cycle } satisfies StaticSchema;
  }
}

export { BinaryCycle, ChordCycle, ValueCycle };
