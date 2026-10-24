import { isStructuredInput } from "@web-audio/patterns";

type StructuredNormalization = {
  readonly origin: "structured";
  readonly values: readonly unknown[];
};

type NormalizeOptions = {
  /** Stop the discovery scan and leave size/shape errors to the consumer. */
  readonly scanBudget?: number;
};

const MAX_ARRAY_INDEX = 2 ** 32 - 1;

function isCanonicalArrayIndex(key: string) {
  if (key === "0") return true;
  const index = Number(key);
  return (
    Number.isInteger(index) &&
    index > 0 &&
    index < MAX_ARRAY_INDEX &&
    String(index) === key
  );
}

function normalizeStructuredInput(
  input: readonly unknown[],
  method: string,
  { scanBudget }: NormalizeOptions = {},
): StructuredNormalization | undefined {
  // Do not read an accessor in the single argument position merely to decide
  // whether this is a wrapper. The public factory's values are already an
  // immutable snapshot, so using them also avoids cloning before bounds run.
  const first =
    input.length === 1
      ? Object.getOwnPropertyDescriptor(input, "0")
      : undefined;
  const wrapper =
    first && "value" in first && isStructuredInput(first.value)
      ? first.value
      : undefined;
  if (wrapper !== undefined) {
    return { origin: "structured", values: wrapper.values };
  }

  const work: (readonly unknown[])[] = [input];
  const visited = new WeakSet<object>();
  visited.add(input);
  let remaining = scanBudget;

  while (work.length > 0) {
    const value = work.pop()!;

    if (remaining !== undefined) {
      if (value.length > remaining) return undefined;
      remaining -= value.length;
    }

    const children: (readonly unknown[])[] = [];
    // Array property enumeration is deliberately limited to actual canonical
    // indices. In particular, metadata and symbols are opaque atom properties.
    for (const key of Object.getOwnPropertyNames(value)) {
      if (!isCanonicalArrayIndex(key)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      // Accessors remain the bounded consumer's responsibility. This keeps the
      // prepass from invoking user code before raw-item limits are enforced.
      if (!descriptor || !("value" in descriptor)) continue;
      const entry: unknown = descriptor.value;
      if (isStructuredInput(entry)) {
        throw new Error(
          `${method} structured input must be the sole argument.`,
        );
      }
      if (Array.isArray(entry)) children.push(entry);
    }
    // Stack order is reversed so the iterative walk follows authored order.
    for (let index = children.length - 1; index >= 0; index--) {
      const child = children[index];
      if (visited.has(child)) continue;
      visited.add(child);
      work.push(child);
    }
  }
  return undefined;
}

export { normalizeStructuredInput };
export type { StructuredNormalization };
