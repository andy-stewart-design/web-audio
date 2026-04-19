import { RandomCycle, ValueCycle } from "@web-audio/patterns";
import { isRandomCycle, isRandomCycleTuple } from "@/utils/validate";
import type { RandomSchema, StaticSchema } from "@web-audio/schema";

class Parameter {
  protected _cycle: ValueCycle | RandomCycle;

  constructor(...input: (number | number[])[] | [RandomCycle]) {
    if (isRandomCycleTuple(input)) {
      this._cycle = input[0];
    } else {
      const cycle = input.map((p) => (Array.isArray(p) ? p : [p]));
      this._cycle = new ValueCycle([0], -1).pattern(...cycle);
    }
  }

  getSchema(): RandomSchema | StaticSchema {
    if (isRandomCycle(this._cycle)) {
      return this._cycle.getRandomSchema();
    } else {
      return this._cycle.getStaticSchema();
    }
  }
}

export default Parameter;
