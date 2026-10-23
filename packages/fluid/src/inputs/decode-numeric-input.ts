import {
  evaluateValuePatternExpression,
  type RandomCycle,
} from "@web-audio/patterns";
import { finiteNumberInterpreter } from "@/inputs/atom-interpreters";
import { isRandomCycleTuple } from "@/inputs/guards";
import {
  decodeShorthandInput,
  isShorthand,
} from "@/inputs/decode-shorthand-input";
import type { NumericPatternInput } from "@/inputs/types";

function decodeNumericInput(
  input: NumericPatternInput,
  method = "[Parameter]",
) {
  if (isRandomCycleTuple<RandomCycle>(input)) return input[0];

  try {
    const shorthand = decodeShorthandInput(input, method);
    if (shorthand) {
      const interpret = finiteNumberInterpreter(method);
      const bars = evaluateValuePatternExpression(
        shorthand.expression,
        (value, range) => {
          const interpreted = interpret(value, range);
          if (interpreted.type !== "event") {
            throw new Error(`${method} shorthand atoms cannot be rests.`);
          }
          return interpreted.value;
        },
      );
      return bars.map((bar) => [...bar]);
    }
  } catch (error) {
    throw withMethodContext(method, error);
  }

  assertNoShorthandInput(input, method);
  return input.map((value) => (Array.isArray(value) ? value : [value]));
}

function withMethodContext(method: string, error: unknown) {
  if (error instanceof Error && error.message.startsWith(`${method} `)) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`${method} ${message}`, { cause: error });
}

function assertNoShorthandInput(
  input: NumericPatternInput,
  method: string,
): asserts input is (number | number[])[] {
  if (input.some(containsShorthandInput)) {
    throw new Error(`${method} shorthand input must be the sole argument.`);
  }
}

function containsShorthandInput(value: unknown): boolean {
  if (typeof value === "string" || isShorthand(value)) return true;
  return Array.isArray(value) && value.some(containsShorthandInput);
}

export { decodeNumericInput };
