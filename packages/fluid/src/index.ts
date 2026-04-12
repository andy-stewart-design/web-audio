import { PatternCycle, RandomCycle } from "@web-audio/patterns";

type Nullable<T> = T | null | undefined;
type ScheduledValue = Nullable<number>;
type Chord = Nullable<ScheduledValue[]>;

interface SchemaValue {
  value: number;
  startOffset: number;
  duration: number;
}

class Instrument {
  private _cycle: PatternCycle<Chord> | RandomCycle<ScheduledValue>;

  constructor(defaultCycle: Chord) {
    this._cycle = new PatternCycle<Chord>(defaultCycle, null);
  }

  euclid(
    pulses: number | number[],
    steps: number,
    rotation: number | number[] = 0,
  ) {
    this._cycle.euclid(pulses, steps, rotation);
    return this;
  }

  hex(...hexes: (string | number)[]) {
    this._cycle.hex(...hexes);
    return this;
  }

  reverse() {
    this._cycle.reverse();
    return this;
  }

  sequence(steps: number, ...pulses: (number | number[])[]) {
    this._cycle.sequence(steps, ...pulses);
    return this;
  }

  xox(...input: (number | number[])[]) {
    this._cycle.xox(...input);
    return this;
  }

  fast(multiplier: number) {
    this._cycle.fast(multiplier);
    return this;
  }

  slow(multiplier: number) {
    this._cycle.slow(multiplier);
    return this;
  }

  stretch(bars: number, steps?: number) {
    this._cycle.stretch(bars, steps);
    return this;
  }

  render(): SchemaValue[][] {
    return Array.from({ length: this._cycle.current.length }, (_, i) => {
      const pattern = this._cycle
        .at(i)
        .map((v) => (Array.isArray(v) ? v : [v]));
      const stepDuration = 1 / pattern.length;

      return pattern.flatMap((chord, chordIdx) =>
        (chord ?? [])
          .filter((v): v is number => typeof v === "number")
          .map((value) => ({
            value,
            startOffset: stepDuration * chordIdx,
            duration: stepDuration,
          })),
      );
    });
  }
}

class Synth extends Instrument {
  constructor() {
    super([60]);
  }
}

export default Instrument;
export { Synth };
