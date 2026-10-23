import { createParameter, type AudioParamInput } from "@/parameters/parameter";
import { isEnvelopeTuple, isLfoTuple, isMidiCcTuple } from "@/inputs/guards";

function resolveAudioParam(input: AudioParamInput, method = "[Parameter]") {
  if (isEnvelopeTuple(input) || isLfoTuple(input) || isMidiCcTuple(input)) {
    return input[0];
  }
  return createParameter(input, method);
}

export { resolveAudioParam };
