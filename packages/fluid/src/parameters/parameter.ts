import { RandomCycle, ValueCycle } from "@web-audio/patterns";
import { isRandomCycle, isRandomCycleTuple } from "@/inputs/guards";
import type { NumberPattern } from "@web-audio/schema";
import type { CycleInput } from "@/inputs/types";
import type Envelope from "@/automations/envelope";
import type Lfo from "@/automations/lfo";
import type { MidiCc } from "@/midi/builders";

type AudioParamSource = Parameter | Envelope | Lfo | MidiCc;
type AudioParamInput = CycleInput<number> | [Envelope] | [Lfo] | [MidiCc];

class Parameter {
  protected _cycle: ValueCycle | RandomCycle;

  constructor(...input: CycleInput<number>) {
    if (isRandomCycleTuple(input)) {
      this._cycle = input[0];
    } else {
      const cycle = input.map((p) => (Array.isArray(p) ? p : [p]));
      this._cycle = new ValueCycle([0], -1).pattern(...cycle);
    }
  }

  getSchema(): NumberPattern {
    if (isRandomCycle(this._cycle)) {
      return this._cycle.getRandomSchema();
    } else {
      return this._cycle.getStaticSchema();
    }
  }
}

export default Parameter;
export type { AudioParamSource, AudioParamInput };
