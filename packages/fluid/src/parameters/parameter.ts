import { type RandomCycle, ValueCycle } from "@web-audio/patterns";
import type { NumberPattern } from "@web-audio/schema";
import { decodeNumericInput } from "@/inputs/decode-numeric-input";
import { isRandomCycle } from "@/inputs/guards";
import type { NumericPatternInput } from "@/inputs/types";
import type Envelope from "@/automations/envelope";
import type Lfo from "@/automations/lfo";
import type { MidiCc } from "@/midi/builders";

type AudioParamSource = Parameter | Envelope | Lfo | MidiCc;
type AudioParamInput = NumericPatternInput | [Envelope] | [Lfo] | [MidiCc];

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

function createParameter(input: NumericPatternInput, method = "[Parameter]") {
  try {
    return new Parameter(...input);
  } catch (error) {
    throw withMethodContext(method, error);
  }
}

function withMethodContext(method: string, error: unknown) {
  const defaultPrefix = "[Parameter] ";
  const message = error instanceof Error ? error.message : String(error);
  const detail = message.startsWith(defaultPrefix)
    ? message.slice(defaultPrefix.length)
    : message;
  if (message.startsWith(`${method} `)) return error;
  return new Error(`${method} ${detail}`, { cause: error });
}

export default Parameter;
export { createParameter };
export type { AudioParamSource, AudioParamInput };
