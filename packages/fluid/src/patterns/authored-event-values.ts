import { MaskedCycle, RandomCycle } from "@web-audio/patterns";
import type { NullableCycleInput } from "@/types";
import EventTiming from "@/patterns/event-timing";
import { isRandomCycleTuple } from "@/utils/validate";
import type { TimingPattern } from "@web-audio/schema";

type StaticAuthoredValues<T> = {
  type: "static";
  cycle: (T[] | null)[][];
  broadcastValue?: T[];
};

type RandomAuthoredValues = {
  type: "random";
  cycle: RandomCycle;
};

type AuthoredEventValuesOptions<T> = {
  validateValue?: (value: T) => boolean;
  invalidValueMessage?: string;
  invalidGroupMessage?: string;
  invalidRestMessage?: string;
};

type AuthoredEventValuesInput<T> = T | null | (T | T[] | null)[];

class AuthoredEventValues<T> {
  private _source: StaticAuthoredValues<T> | RandomAuthoredValues;
  private _hasAuthoredValues = false;

  private constructor(
    source: StaticAuthoredValues<T> | RandomAuthoredValues,
    hasAuthoredValues = false,
  ) {
    this._source = source;
    this._hasAuthoredValues = hasAuthoredValues;
  }

  static fromDefault<T>(value: T) {
    return new AuthoredEventValues<T>(
      {
        type: "static",
        cycle: [[[value]]],
        broadcastValue: [value],
      },
      false,
    );
  }

  static fromInput<T>(
    input: NullableCycleInput<T>,
    options: AuthoredEventValuesOptions<T> = {},
  ) {
    if (input.length === 0) {
      throw new Error(
        "[Fluid] Authored event values require at least one pattern.",
      );
    }

    if (isRandomCycleTuple(input)) {
      return new AuthoredEventValues<T>(
        { type: "random", cycle: input[0] },
        true,
      );
    }

    const cycle = input.map((bar) => normalizeBar(bar, options));
    return new AuthoredEventValues<T>(
      {
        type: "static",
        cycle,
        broadcastValue: getBroadcastValue(cycle),
      },
      true,
    );
  }

  get hasAuthoredValues() {
    return this._hasAuthoredValues;
  }

  get source() {
    return this._source;
  }

  get hasRests() {
    return (
      this._source.type === "static" &&
      this._source.broadcastValue === undefined &&
      this._source.cycle.some((bar) => bar.some((group) => group === null))
    );
  }

  reverse() {
    this._transform((cycle) => cycle.reverse());
    return this;
  }

  materializeAgainstTiming(timing: TimingPattern) {
    if (this._source.type === "random" || this._source.broadcastValue) {
      return this;
    }

    const source = this._source.cycle.map((bar) =>
      bar.filter((group): group is T[] => group !== null),
    );
    const { cycle, mask } = new EventTiming(timing).alignValues(source);
    const values = new MaskedCycle(cycle).xox(...mask).transformedValues;
    this._source = { type: "static", cycle: values };
    return this;
  }

  fast(multiplier: number) {
    this._transform((cycle) => cycle.fast(multiplier));
    return this;
  }

  slow(multiplier: number) {
    this._transform((cycle) => cycle.slow(multiplier));
    return this;
  }

  stretch(bars: number, steps?: number) {
    this._transform((cycle) => cycle.stretch(bars, steps));
    return this;
  }

  private _transform(
    transform: (cycle: MaskedCycle<T[] | null> | RandomCycle) => void,
  ) {
    if (this._source.type === "random") {
      transform(this._source.cycle);
      return;
    }

    const cycle = new MaskedCycle(this._source.cycle);
    transform(cycle);
    this._source = {
      type: "static",
      cycle: cycle.transformedValues,
      broadcastValue: this._source.broadcastValue,
    };
  }
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

function getBroadcastValue<T>(cycle: (T[] | null)[][]) {
  return cycle.length === 1 && cycle[0].length === 1
    ? (cycle[0][0] ?? undefined)
    : undefined;
}

export default AuthoredEventValues;
export type {
  AuthoredEventValuesOptions,
  AuthoredEventValuesInput,
  RandomAuthoredValues,
  StaticAuthoredValues,
};
