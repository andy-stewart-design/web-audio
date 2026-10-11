import { parseShorthand, type Shorthand } from "@web-audio/patterns";

function isShorthand(value: unknown): value is Shorthand {
  if (typeof value !== "object" || value === null) return false;
  if (!("type" in value) || value.type !== "shorthand") return false;
  if (!("source" in value) || typeof value.source !== "string") return false;
  return (
    "expression" in value &&
    typeof value.expression === "object" &&
    value.expression !== null
  );
}

function getShorthandSource(
  input: readonly unknown[],
  method: string,
  { allowMultipleStrings = false } = {},
) {
  const shorthand = input.find(isShorthand);
  if (shorthand) {
    if (input.length !== 1) {
      throw new Error(`${method} shorthand input must be the sole argument.`);
    }
    return shorthand.source;
  }

  const string = input.find(
    (value): value is string => typeof value === "string",
  );
  if (input.length === 1 && string !== undefined) return string;
  if (string !== undefined && !allowMultipleStrings) {
    throw new Error(`${method} shorthand input must be the sole argument.`);
  }
  return undefined;
}

function decodeShorthandInput(
  input: readonly unknown[],
  method: string,
  options?: { readonly allowMultipleStrings?: boolean },
) {
  const source = getShorthandSource(input, method, options);
  if (source === undefined) return undefined;
  const shorthand = input[0];
  return {
    source,
    expression: isShorthand(shorthand)
      ? shorthand.expression
      : parseShorthand(source),
  };
}

export { decodeShorthandInput, getShorthandSource, isShorthand };
