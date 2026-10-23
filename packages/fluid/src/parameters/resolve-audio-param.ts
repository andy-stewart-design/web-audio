import Parameter, { type AudioParamInput } from "@/parameters/parameter";
import { isEnvelopeTuple, isLfoTuple, isMidiCcTuple } from "@/inputs/guards";

function resolveAudioParam(input: AudioParamInput) {
  if (isEnvelopeTuple(input) || isLfoTuple(input) || isMidiCcTuple(input)) {
    return input[0];
  }
  return new Parameter(...input);
}

export { resolveAudioParam };
