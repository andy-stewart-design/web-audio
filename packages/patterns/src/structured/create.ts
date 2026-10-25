import { MAX_EVENT_CYCLE_VOICES, MAX_EXPRESSION_DEPTH } from "../limits";

const STRUCTURED_INPUT = Symbol("StructuredInput");
// Count raw arrays and atoms, allowing room for voice data plus its structure.
const MAX_STRUCTURED_INPUT_ITEMS = 2 * MAX_EVENT_CYCLE_VOICES;

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

function createStructuredInput<T extends StructuredAtom>(
  ...input: [StructuredArgument<T>, ...StructuredArgument<T>[]]
): StructuredInput<T> {
  if (input.length === 0) {
    throw new TypeError("structured input requires at least one value.");
  }

  const active = new WeakSet<object>();
  let remaining = MAX_STRUCTURED_INPUT_ITEMS;

  function assertBudget(count: number, path: string) {
    if (count > remaining) {
      throw new TypeError(
        `structured input exceeds ${MAX_STRUCTURED_INPUT_ITEMS} array/value occurrences at ${path}.`,
      );
    }
  }

  function snapshot(
    value: StructuredValue<T>,
    path: string,
    depth: number,
  ): StructuredValue<T> {
    assertBudget(1, path);
    remaining--;
    if (Array.isArray(value)) {
      if (active.has(value)) {
        throw new TypeError(`structured input contains a cycle at ${path}.`);
      }
      if (depth >= MAX_EXPRESSION_DEPTH) {
        throw new TypeError(
          `structured input exceeds ${MAX_EXPRESSION_DEPTH} array levels at ${path}.`,
        );
      }
      // Check before allocating a copy or reading any array entries.
      assertBudget(value.length, path);
      active.add(value);
      try {
        return Object.freeze(
          Array.from(value, (entry, index) =>
            snapshot(entry, `${path}[${index}]`, depth + 1),
          ),
        );
      } finally {
        active.delete(value);
      }
    }

    if (value === null || typeof value === "string") return value;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        throw new TypeError(
          `structured input value at ${path} must be finite.`,
        );
      }
      return value;
    }
    throw new TypeError(
      `structured input values must be numbers, strings, null, or arrays; invalid value at ${path}.`,
    );
  }

  assertBudget(input.length, "[]");
  const values = Object.freeze(
    input.map((value, index) => snapshot(value, `[${index}]`, 0)),
  );
  return Object.freeze({
    type: "structured-input",
    [STRUCTURED_INPUT]: true,
    values,
  } satisfies StructuredInput<T>);
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
