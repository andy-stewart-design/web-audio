import FixedTimingCycle from "./fixed-timing-cycle";
import PatternCycle from "./pattern-cycle";
import { isNonNegativeInteger } from "../math/validate";
import type {
  ChanceCondition,
  RandomNumberPattern,
  TimingPattern,
} from "@web-audio/schema";

class RandomCycle extends PatternCycle<1 | 0> {
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
    super([1], 0);
    this.rib = this.ribbon.bind(this);
  }

  getFixedTimingCycle() {
    return new FixedTimingCycle(this.current);
  }

  get candidateTiming(): TimingPattern {
    return this.getFixedTimingCycle().getTimingPattern();
  }

  get dataType() {
    return this._type;
  }

  steps(...counts: number[]) {
    if (counts.length === 0) {
      throw new Error("RandomCycle.steps() requires at least one step count");
    }

    if (counts.some((count) => !isNonNegativeInteger(count))) {
      throw new Error(
        "RandomCycle.steps() counts must be finite, non-negative integers",
      );
    }

    this.replace(counts.map((count) => Array.from({ length: count }, () => 1)));
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

  getRandomSchema() {
    if (this._chance !== undefined) {
      throw new Error(
        "[Pattern] RandomCycle.chance() configures event timing and cannot be serialized as a numeric value pattern.",
      );
    }

    return {
      type: "random-number",
      valuesPerBar: this.current.map(
        (bar) => bar.filter((value) => value === 1).length,
      ),
      dataType: this._type,
      range: this._range ? { ...this._range } : undefined,
      segments: this.getSegments(),
      algorithm: this._algorithm,
      quantValue: this._quantValue,
      order: this._order,
    } satisfies RandomNumberPattern;
  }

  getTimingCondition() {
    if (this._type !== "binary") {
      throw new Error(
        "[Pattern] RandomCycle event timing requires a binary random cycle. Call .bin() before using it as timing.",
      );
    }

    return {
      type: "chance",
      probability: this._chance ?? 0.5,
      segments: this.getSegments(),
      algorithm: this._algorithm,
      order: this._order,
    } satisfies ChanceCondition;
  }

  getTimingPattern(): TimingPattern {
    const condition = this.getTimingCondition();
    if (condition.probability === 0) {
      return {
        cycle: this.current.map(() => []),
        condition: undefined,
      } satisfies TimingPattern;
    }

    const timing = this.candidateTiming;
    if (condition.probability === 1) return timing;

    return { ...timing, condition } satisfies TimingPattern;
  }

  private getSegments() {
    const segments = this._segments ?? [{ seed: this._baseSeed }];
    return segments.map((segment) => ({ ...segment }));
  }
}

export default RandomCycle;
