import { RandomCycle } from "@web-audio/patterns";
import type { NullableCycleInput } from "@/types";
import { isRandomCycleTuple } from "@/utils/validate";

type StaticAuthoredValues<T> = {
  type: "static";
  cycle: (T[] | null)[][];
};

type RandomAuthoredValues = {
  type: "random";
  cycle: RandomCycle;
};

type AuthoredEventValues<T> = {
  explicit: boolean;
  source: StaticAuthoredValues<T> | RandomAuthoredValues;
};

type AuthoredEventValuesOptions<T> = {
  validateValue?: (value: T) => boolean;
  invalidValueMessage?: string;
  invalidGroupMessage?: string;
  invalidRestMessage?: string;
};

type AuthoredEventValuesInput<T> = T | null | (T | T[] | null)[];

function createDefaultAuthoredEventValues<T>(value: T): AuthoredEventValues<T> {
  return {
    explicit: false,
    source: { type: "static", cycle: [[[value]]] },
  };
}

function createAuthoredEventValues<T>(
  input: NullableCycleInput<T>,
  options: AuthoredEventValuesOptions<T> = {},
): AuthoredEventValues<T> {
  if (input.length === 0) {
    throw new Error(
      "[Fluid] Authored event values require at least one pattern.",
    );
  }

  if (isRandomCycleTuple(input)) {
    return { explicit: true, source: { type: "random", cycle: input[0] } };
  }

  return {
    explicit: true,
    source: {
      type: "static",
      cycle: input.map((bar) => normalizeBar(bar, options)),
    },
  };
}

function hasAuthoredEventValueRests<T>(values: AuthoredEventValues<T>) {
  return (
    values.source.type === "static" &&
    values.source.cycle.some((bar) => bar.some((group) => group === null))
  );
}

function normalizeBar<T>(
  input: AuthoredEventValuesInput<T>,
  options: AuthoredEventValuesOptions<T>,
) {
  if (input === null) return [null];
  if (!Array.isArray(input)) {
    validateValue(input, options);
    return [[input]];
  }
  if (input.length === 0) return [null];

  return input.map((hit) => normalizeHit(hit, options));
}

function normalizeHit<T>(
  hit: T | T[] | null,
  options: AuthoredEventValuesOptions<T>,
) {
  if (hit === null) return null;
  if (!Array.isArray(hit)) {
    validateValue(hit, options);
    return [hit];
  }
  if (hit.length === 0) {
    throw new Error(
      options.invalidGroupMessage ??
        "[Fluid] Authored event values cannot contain an empty voice group.",
    );
  }
  if (hit.some((value) => value === null)) {
    throw new Error(
      options.invalidRestMessage ??
        "[Fluid] Authored event value null is only allowed as a whole-hit rest.",
    );
  }
  hit.forEach((value) => validateValue(value, options));
  return [...hit];
}

function validateValue<T>(value: T, options: AuthoredEventValuesOptions<T>) {
  if (options.validateValue?.(value) !== false) return;
  throw new Error(
    options.invalidValueMessage ?? "[Fluid] Authored event value is invalid.",
  );
}

export {
  createDefaultAuthoredEventValues,
  createAuthoredEventValues,
  hasAuthoredEventValueRests,
};
export type {
  AuthoredEventValues,
  AuthoredEventValuesOptions,
  RandomAuthoredValues,
  StaticAuthoredValues,
};
