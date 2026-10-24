import { isStructuredInput } from "@web-audio/patterns";

type StructuredNormalization = {
  readonly origin: "structured";
  readonly values: readonly unknown[];
};

function normalizeStructuredInput(
  input: readonly unknown[],
  method: string,
): StructuredNormalization | undefined {
  const wrapper = input.find(isStructuredInput);
  if (wrapper !== undefined) {
    if (input.length !== 1 || input[0] !== wrapper) {
      throw new Error(`${method} structured input must be the sole argument.`);
    }
    return { origin: "structured", values: wrapper.getValues() };
  }

  if (input.some(containsStructuredInput)) {
    throw new Error(`${method} structured input must be the sole argument.`);
  }
  return undefined;
}

function containsStructuredInput(value: unknown): boolean {
  return Array.isArray(value) && value.some(containsStructuredInput)
    ? true
    : isStructuredInput(value);
}

export { normalizeStructuredInput };
export type { StructuredNormalization };
