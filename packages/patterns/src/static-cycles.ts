import PatternCycle from "./pattern-cycle";
import type { Chord, StaticSchemaValue } from "./types";

class BinaryCycle extends PatternCycle<1 | 0> {
  constructor() {
    super([1], 0);
  }

  getStaticSchema() {
    return this._cycle.map((pattern) => {
      const duration = 1 / pattern.length;

      return pattern.reduce<StaticSchemaValue[]>((acc, value, i) => {
        if (value === 1) {
          acc.push({ value, duration, startOffset: duration * i });
        }
        return acc;
      }, []);
    });
  }
}

class ChordCycle extends PatternCycle<Chord> {
  constructor(defaultPatern: Chord) {
    super(defaultPatern, null);
  }

  getStaticSchema(): StaticSchemaValue[][] {
    return this._cycle.map((pattern) => {
      const stepDuration = 1 / pattern.length;

      return pattern.flatMap((chord, chordIdx) =>
        (chord ?? [])
          .filter((v) => typeof v === "number")
          .map((value) => ({
            value,
            startOffset: stepDuration * chordIdx,
            duration: stepDuration,
          })),
      );
    });
  }
}

export { BinaryCycle, ChordCycle };
