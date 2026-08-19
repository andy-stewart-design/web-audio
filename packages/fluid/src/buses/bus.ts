import Filter from "@/effects/filter";
import GainEffect from "@/effects/gain";
import { normalizeBusGain, normalizeBusName } from "@/utils/signal-graph";

class Bus {
  readonly name: string;
  private _gain = 1;
  private _effects: (Filter | GainEffect)[] = [];

  constructor(name: string) {
    this.name = normalizeBusName(name);
  }

  gain(value: number) {
    this._gain = normalizeBusGain(value);
    return this;
  }

  fx(...effects: (Filter | GainEffect)[]) {
    this._effects.push(...effects);
    return this;
  }

  getSchema() {
    return {
      gain: this._gain,
      effects: this._effects.map((effect) => effect.getSchema()),
    };
  }
}

export default Bus;
