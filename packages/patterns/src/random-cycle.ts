import { BinaryCycle } from "./static-cycles";
import type {
  ChanceCondition,
  RandomNumberPattern,
  TimingSchema,
} from "./types";

class RandomCycle extends BinaryCycle {
  private _type: RandomNumberPattern["dataType"] = "float";
  private _baseSeed: number = 0;
  private _segments: { seed: number; len: number }[] | undefined;
  private _range: { min: number; max: number } | undefined;
  private _quantValue: number | undefined;
  private _chance: number | undefined;
  private _algorithm: RandomNumberPattern["algorithm"] = "xor";
  private _order: RandomNumberPattern["order"] = "forward";
  public rib: (
    seed: number | number[],
    loop?: number | number[] | undefined,
  ) => this;

  constructor() {
    super();
    this.rib = this.ribbon.bind(this);
  }

  steps(...counts: number[]) {
    if (counts.length === 0) {
      throw new Error("RandomCycle.steps() requires at least one step count");
    }

    if (
      counts.some(
        (count) =>
          !Number.isFinite(count) || count < 0 || !Number.isInteger(count),
      )
    ) {
      throw new Error(
        "RandomCycle.steps() counts must be finite, non-negative integers",
      );
    }

    this._cycle = counts.map((count) => Array.from({ length: count }, () => 1));
    return this;
  }

  ribbon(seed: number | number[], loop?: number | number[]) {
    const seeds = Array.isArray(seed) ? seed : [seed];
    this._baseSeed = seeds[0];

    if (loop !== undefined) {
      const lengths = Array.isArray(loop) ? loop : [loop];
      const count = Math.max(seeds.length, lengths.length);
      this._segments = Array.from({ length: count }, (_, i) => ({
        seed: seeds[i % seeds.length],
        len: lengths[i % lengths.length],
      }));
    } else {
      this._segments = undefined;
    }

    return this;
  }

  range(min: number, max: number) {
    this._range = { min, max };
    return this;
  }

  int() {
    this._type = "integer";
    return this;
  }

  bin() {
    this._type = "binary";
    return this;
  }

  chance(probability: number) {
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
      throw new Error(
        "RandomCycle.chance() probability must be a finite number from 0 to 1",
      );
    }

    this._chance = probability;
    return this;
  }

  quant(step: number) {
    this._quantValue = step;
    return this;
  }

  algo(name: RandomNumberPattern["algorithm"]) {
    this._algorithm = name;
    return this;
  }

  override reverse() {
    super.reverse();
    this._order = this._order === "forward" ? "reverse" : "forward";
    return this;
  }

  getRandomSchema(): RandomNumberPattern {
    if (this._chance !== undefined) {
      throw new Error(
        "[Pattern] RandomCycle.chance() configures event timing and cannot be serialized as a numeric value pattern.",
      );
    }

    return {
      type: "random-number",
      valuesPerBar: this._cycle.map(
        (bar) => bar.filter((value) => value === 1).length,
      ),
      dataType: this._type,
      range: this._range ? { ...this._range } : undefined,
      segments: this.getSegments(),
      algorithm: this._algorithm,
      quantValue: this._quantValue,
      order: this._order,
    };
  }

  override getTimingSchema(): TimingSchema {
    if (this._type !== "binary") {
      throw new Error(
        "[Pattern] RandomCycle event timing requires a binary random cycle. Call .bin() before using it as timing.",
      );
    }

    const probability = this._chance ?? 0.5;
    if (probability === 0) {
      return { cycle: this._cycle.map(() => []) };
    }

    const timing = super.getTimingSchema();
    if (probability === 1) return timing;

    return {
      ...timing,
      condition: {
        type: "chance",
        probability,
        segments: this.getSegments(),
        algorithm: this._algorithm,
        order: this._order,
      } satisfies ChanceCondition,
    };
  }

  private getSegments(): ChanceCondition["segments"] {
    const segments = this._segments ?? [{ seed: this._baseSeed }];
    return segments.map((segment) => ({ ...segment }));
  }
}

export default RandomCycle;
