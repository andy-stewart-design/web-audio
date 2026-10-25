import Envelope from "@/automations/envelope";
import Lfo from "@/automations/lfo";
import { isEnvelopeTuple, isLfoTuple, isMidiCcTuple } from "@/inputs/guards";
import { MidiCc } from "@/midi/builders";
import {
  createParameter,
  createParameterValue,
  type AudioParamInput,
} from "@/parameters/parameter";
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
  ) {
    return value;
  }
  return createParameterValue(value, method);
}

export { resolveAudioParam, resolveAudioParamValue };
