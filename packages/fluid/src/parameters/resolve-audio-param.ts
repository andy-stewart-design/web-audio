import { isStructuredInput, RandomCycle } from "@web-audio/patterns";
import Envelope from "@/automations/envelope";
import Lfo from "@/automations/lfo";
import { isShorthand } from "@/inputs/decode-shorthand-input";
import { decodeStructuredNumericInput } from "@/inputs/decode-numeric-input";
import { isEnvelopeTuple, isLfoTuple, isMidiCcTuple } from "@/inputs/guards";
import { MidiCc } from "@/midi/builders";
import { createParameter, type AudioParamInput } from "@/parameters/parameter";
import type { SingleSlotAudioParamInput } from "@/inputs/types";

function resolveAudioParam(input: AudioParamInput, method = "[Parameter]") {
  if (isEnvelopeTuple(input) || isLfoTuple(input) || isMidiCcTuple(input)) {
    return input[0];
  }
  return createParameter(input, method);
}

function resolveAudioParamValue(
  value: SingleSlotAudioParamInput | undefined,
  method: string,
) {
  if (value === undefined || value === null || Array.isArray(value)) {
    throw new TypeError(`${method} input must be provided as one value.`);
  }

  if (
    value instanceof Envelope ||
    value instanceof Lfo ||
    value instanceof MidiCc
  )
    return value;
  if (value instanceof RandomCycle) return createParameter([value], method);

  let parameter;
  if (isStructuredInput(value)) {
    parameter = createParameter(
      decodeStructuredNumericInput(value.values, method),
      method,
    );
  } else if (typeof value === "number") {
    parameter = createParameter([value], method);
  } else if (typeof value === "string" || isShorthand(value)) {
    parameter = createParameter([value], method);
  } else {
    throw new TypeError(
      `${method} input must be a finite number, shorthand, structured input, random cycle, or permitted audio source.`,
    );
  }

  try {
    parameter.getSchema();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(`${method} `)) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${method} ${message}`, { cause: error });
  }
  return parameter;
}

export { resolveAudioParam, resolveAudioParamValue };
