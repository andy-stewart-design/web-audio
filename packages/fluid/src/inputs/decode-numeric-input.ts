import type { RandomCycle } from "@web-audio/patterns";
import { isRandomCycleTuple } from "@/inputs/guards";
import type { CycleInput } from "@/inputs/types";

function decodeNumericInput(input: CycleInput<number>) {
  if (isRandomCycleTuple<RandomCycle>(input)) return input[0];
  return input.map((value) => (Array.isArray(value) ? value : [value]));
}

export { decodeNumericInput };
