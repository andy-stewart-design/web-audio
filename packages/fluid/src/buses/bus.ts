import type { BusSchema } from "@web-audio/schema";
import type Filter from "@/effects/filter";
import type GainEffect from "@/effects/gain";

class Bus {
  readonly name: string;
  private _gain = 1;
  private _effects: (Filter | GainEffect)[] = [];

  constructor(name: string) {
    this.name = name;
  }

  gain(value: number) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(
        "[Bus] gain() must be a finite number greater than or equal to 0.",
      );
    }
    this._gain = value;
    return this;
  }

  fx(...effects: (Filter | GainEffect)[]) {
    if (this.name === "main") {
      throw new Error(
        "[Bus] Effects on main are not supported in the bus MVP.",
      );
    }
    this._effects.push(...effects);
    return this;
  }

  getSchema(): BusSchema {
    return {
      gain: this._gain,
      effects: this._effects.map((effect) => effect.getSchema()),
    };
  }
}

export default Bus;
