import { BinaryCycle } from "./static-cycles";
import type { RandomSchema } from "./types";

class RandomCycle2 extends BinaryCycle {
  private _type: "float" | "integer" | "binary" = "float";
  private _baseSeed: number = 0;
  private _segments: { seed: number; len: number }[] | undefined;
  private _range: { min: number; max: number } | undefined;
  private _quantValue: number | undefined;
  private _algorithm: "xor" | "mulberry" = "xor";

  steps(n: number) {
    this._cycle = [Array.from({ length: n }, () => 1)];
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

  quant(step: number) {
    this._quantValue = step;
    return this;
  }

  algo(name: "xor" | "mulberry") {
    this._algorithm = name;
    return this;
  }

  getRandomSchema(): RandomSchema {
    const maskCycle = this.getStaticSchema();

    return {
      type: this._type,
      range: this._range,
      segments: this._segments ?? [{ seed: this._baseSeed }],
      algorithm: this._algorithm,
      quantValue: this._quantValue,
      maskCycle,
    };
  }
}

export default RandomCycle2;
