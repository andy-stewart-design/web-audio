import { type RandomCycle, ValueCycle } from "@web-audio/patterns";
import type { NumberPattern } from "@web-audio/schema";
import { decodeNumericInput } from "@/inputs/decode-numeric-input";
import { isRandomCycle } from "@/inputs/guards";
import type { CycleInput, NumericPatternInput } from "@/inputs/types";
import type Envelope from "@/automations/envelope";
import type Lfo from "@/automations/lfo";
import type { MidiCc } from "@/midi/builders";

type AudioParamSource = Parameter | Envelope | Lfo | MidiCc;
type AudioParamInput = CycleInput<number> | [Envelope] | [Lfo] | [MidiCc];

class Parameter {
  protected _cycle: ValueCycle | RandomCycle;

  constructor(...input: NumericPatternInput) {
    const decoded = decodeNumericInput(input);
    if (isRandomCycle(decoded)) {
      this._cycle = decoded;
    } else {
      this._cycle = new ValueCycle([0], -1).pattern(...decoded);
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
