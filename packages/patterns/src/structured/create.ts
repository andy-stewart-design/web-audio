const STRUCTURED_INPUT = Symbol("StructuredInput");

type StructuredAtom = number | string | null;
type StructuredValue<T extends StructuredAtom> =
  | T
  | readonly StructuredValue<T>[];
type StructuredArgument<T extends StructuredAtom> = StructuredValue<T>;

interface StructuredInput<T extends StructuredAtom = StructuredAtom> {
  readonly type: "structured-input";
  readonly [STRUCTURED_INPUT]: true;
  readonly values: readonly StructuredValue<T>[];
}

function snapshotStructuredValue<T extends StructuredAtom>(
  value: StructuredValue<T>,
  path: string,
): StructuredValue<T> {
  if (Array.isArray(value)) {
    return Object.freeze(
      Array.from(value, (entry, index) =>
        snapshotStructuredValue<T>(entry, `${path}[${index}]`),
      ),
    );
  }

  if (value === null || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`structured input value at ${path} must be finite.`);
    }
    return value;
  }
  throw new TypeError(
    `structured input values must be numbers, strings, null, or arrays; invalid value at ${path}.`,
  );
}

function createStructuredInput<T extends StructuredAtom>(
  ...input: [StructuredArgument<T>, ...StructuredArgument<T>[]]
): StructuredInput<T> {
  if (input.length === 0) {
    throw new TypeError("structured input requires at least one value.");
  }

  const values = Object.freeze(
    input.map((value, index) =>
      snapshotStructuredValue<T>(value, `[${index}]`),
    ),
  );
  const structuredInput: StructuredInput<T> = {
    type: "structured-input",
    [STRUCTURED_INPUT]: true,
    values,
  };
  return Object.freeze(structuredInput);
}

function isStructuredInput(value: unknown): value is StructuredInput {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "structured-input" &&
    STRUCTURED_INPUT in value &&
    value[STRUCTURED_INPUT] === true &&
    "values" in value &&
    Array.isArray(value.values)
  );
}

export { createStructuredInput, isStructuredInput };
export type {
  StructuredArgument,
  StructuredAtom,
  StructuredInput,
  StructuredValue,
};
