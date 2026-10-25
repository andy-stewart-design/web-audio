import { describe, expect, expectTypeOf, it } from "vitest";
import RandomCycle from "../../cycles/random-cycle";
import { MAX_EVENT_CYCLE_VOICES, MAX_EXPRESSION_DEPTH } from "../../limits";
import { createShorthand } from "../../shorthand/create";
import {
  createStructuredInput,
  isStructuredInput,
  type StructuredInput,
  type StructuredValue,
} from "../create";

const maxStructuredInputItems = 2 * MAX_EVENT_CYCLE_VOICES;

describe("structured input factory", () => {
  it("preserves variadic bars and within-bar geometry", () => {
    expect(createStructuredInput(0.2, 0.1).values).toEqual([0.2, 0.1]);
    expect(createStructuredInput([0.2, 0.1]).values).toEqual([[0.2, 0.1]]);
  });

  it("snapshots and freezes nested static data", () => {
    const chord = [60, 64];
    const bar = [chord, null];
    const input = createStructuredInput(bar);
    chord[0] = 72;
    bar[0] = [67];

    expect(input.values).toEqual([[[60, 64], null]]);
    expect(Object.isFrozen(input)).toBe(true);
    expect(Object.isFrozen(input.values)).toBe(true);
    const storedBar = input.values[0];
    if (!Array.isArray(storedBar)) throw new Error("Expected a stored bar");
    expect(Object.isFrozen(storedBar)).toBe(true);
    expect(Reflect.set(storedBar, 0, 0.9)).toBe(false);
    const storedChord = storedBar[0];
    if (!Array.isArray(storedChord)) throw new Error("Expected a stored chord");
    expect(Object.isFrozen(storedChord)).toBe(true);
    expect(Reflect.set(storedChord, 0, 72)).toBe(false);
  });

  it("recognizes only its opaque values", () => {
    const input = createStructuredInput("bd", null);
    expect(isStructuredInput(input)).toBe(true);
    expect(isStructuredInput({ type: "structured-input" })).toBe(false);
    expect(isStructuredInput({ type: "structured-input", values: [0.2] })).toBe(
      false,
    );
    expect(input.values).toEqual(["bd", null]);
    expect(input).not.toHaveProperty("getValues");
  });

  it("accepts generic atom types while rejecting invalid data", () => {
    const strings: StructuredInput<string | null> = createStructuredInput(
      "bd",
      ["sd", null],
    );
    expect(strings.values).toEqual(["bd", ["sd", null]]);

    expect(() => Reflect.apply(createStructuredInput, undefined, [])).toThrow(
      "at least one",
    );
    expect(() => createStructuredInput(NaN)).toThrow("finite");
    expect(() => createStructuredInput(Infinity)).toThrow("finite");
    const nested = createStructuredInput(0.2);
    const invalid = [
      createShorthand("0.2"),
      { source: "envelope" },
      new RandomCycle(),
      nested,
      [nested],
      undefined,
      true,
      1n,
      Symbol("invalid atom"),
      () => 0.2,
    ];
    for (const value of invalid) {
      expect(() =>
        Reflect.apply(createStructuredInput, undefined, [value]),
      ).toThrow("numbers, strings, null, or arrays");
    }
  });

  it("does not expose a broad invalid-object overload", () => {
    const typeChecks = () => {
      const input = createStructuredInput(0.2, [0.1]);
      // @ts-expect-error The public snapshot is readonly.
      input.values.push(0.3);
      // @ts-expect-error Structured values contain only static atoms.
      createStructuredInput({});
      // @ts-expect-error Random sources must be passed directly to consumers.
      createStructuredInput(new RandomCycle());
      // @ts-expect-error Reusable shorthand is not structured atom data.
      createStructuredInput(createShorthand("0.2"));
      // @ts-expect-error Structured values cannot be empty.
      createStructuredInput();
    };
    expectTypeOf(typeChecks).toBeFunction();
  });

  it("rejects direct and mutual cycles as TypeErrors with repeated paths", () => {
    const selfCycle: StructuredValue<number>[] = [];
    selfCycle.push(selfCycle);

    expect(() => createStructuredInput(selfCycle)).toThrowError(TypeError);
    expect(() => createStructuredInput(selfCycle)).toThrowError(
      /cycle at \[0\]\[0\]\./,
    );

    const first: StructuredValue<number>[] = [];
    const second: StructuredValue<number>[] = [];
    first.push(second);
    second.push(first);

    expect(() => createStructuredInput(first)).toThrowError(TypeError);
    expect(() => createStructuredInput(first)).toThrowError(
      /cycle at \[0\]\[0\]\[0\]\./,
    );
  });

  it("copies shared branches independently", () => {
    const shared: StructuredValue<number>[] = [1, 2];
    const input = createStructuredInput([shared], [shared]);

    const first = input.values[0];
    const second = input.values[1];
    if (!Array.isArray(first) || !Array.isArray(second)) {
      throw new Error("Expected stored branches");
    }
    const firstShared = first[0];
    const secondShared = second[0];
    if (!Array.isArray(firstShared) || !Array.isArray(secondShared)) {
      throw new Error("Expected stored shared arrays");
    }

    shared[0] = 99;
    expect(input.values).toEqual([[[1, 2]], [[1, 2]]]);
    expect(first).not.toBe(second);
    expect(firstShared).not.toBe(secondShared);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(second)).toBe(true);
    expect(Object.isFrozen(firstShared)).toBe(true);
    expect(Object.isFrozen(secondShared)).toBe(true);
  });

  it("enforces expression depth without recursing while building test data", () => {
    let accepted: StructuredValue<number> = 0;
    for (let depth = 0; depth < MAX_EXPRESSION_DEPTH; depth++) {
      accepted = [accepted];
    }

    const input = createStructuredInput(accepted);
    let value = input.values[0];
    let arrayCount = 0;
    while (Array.isArray(value)) {
      expect(Object.isFrozen(value)).toBe(true);
      expect(value).toHaveLength(1);
      value = value[0];
      arrayCount++;
    }
    expect(arrayCount).toBe(MAX_EXPRESSION_DEPTH);
    expect(value).toBe(0);

    let rejected: StructuredValue<number> = 0;
    for (let depth = 0; depth <= MAX_EXPRESSION_DEPTH; depth++) {
      rejected = [rejected];
    }
    expect(() => createStructuredInput(rejected)).toThrowError(TypeError);
    expect(() => createStructuredInput(rejected)).toThrowError(
      /exceeds 128 array levels/,
    );
  });

  it("rejects very deep acyclic values deliberately rather than overflowing", () => {
    let value: StructuredValue<number> = 0;
    for (let depth = 0; depth < 10_000; depth++) {
      value = [value];
    }

    expect(() => createStructuredInput(value)).toThrowError(TypeError);
    expect(() => createStructuredInput(value)).toThrowError(
      /exceeds 128 array levels/,
    );
  });

  it("enforces the raw occurrence budget, including nulls and empty arrays", () => {
    const exact = Array.from(
      { length: maxStructuredInputItems - 1 },
      (_, index) => index,
    );
    const accepted = createStructuredInput(exact);
    expect(accepted.values[0]).toHaveLength(maxStructuredInputItems - 1);
    expect(Object.isFrozen(accepted.values[0])).toBe(true);

    exact.push(0);
    expect(() => createStructuredInput(exact)).toThrowError(TypeError);
    expect(() => createStructuredInput(exact)).toThrowError(
      /exceeds 131072 array\/value occurrences/,
    );

    const nullsAndEmpty: StructuredValue<number | null>[] = Array.from(
      { length: maxStructuredInputItems - 2 },
      () => null,
    );
    nullsAndEmpty.push([]);
    const boundary = createStructuredInput(nullsAndEmpty);
    const stored = boundary.values[0];
    if (!Array.isArray(stored))
      throw new Error("Expected stored boundary array");
    expect(stored).toHaveLength(maxStructuredInputItems - 1);
    expect(stored[stored.length - 1]).toEqual([]);
    expect(Object.isFrozen(stored[stored.length - 1])).toBe(true);
  });

  it("shares the occurrence budget across arguments and repeated arguments", () => {
    const argumentLength = MAX_EVENT_CYCLE_VOICES - 1;
    const first = Array.from({ length: argumentLength }, () => 0);
    const second = Array.from({ length: argumentLength }, () => 0);
    const accepted = createStructuredInput(first, second);
    expect(accepted.values).toHaveLength(2);
    expect(Object.isFrozen(accepted.values[0])).toBe(true);
    expect(Object.isFrozen(accepted.values[1])).toBe(true);

    second.push(0);
    expect(() => createStructuredInput(first, second)).toThrowError(TypeError);

    const repeated = Array.from({ length: argumentLength }, () => 0);
    const repeatedSnapshot = createStructuredInput(repeated, repeated);
    expect(repeatedSnapshot.values[0]).not.toBe(repeatedSnapshot.values[1]);
  });

  it("counts shared DAG expansion rather than memoizing it", () => {
    let dag: StructuredValue<number> = 0;
    for (let level = 0; level < 17; level++) {
      dag = [dag, dag];
    }

    expect(() => createStructuredInput(dag)).toThrowError(TypeError);
    expect(() => createStructuredInput(dag)).toThrowError(
      /exceeds 131072 array\/value occurrences/,
    );
  });

  it("checks sparse array lengths before reading entries", () => {
    let reads = 0;
    const sparse = new Array<number>(2 ** 32 - 1);
    Object.defineProperty(sparse, 0, {
      configurable: true,
      enumerable: true,
      get() {
        reads++;
        return 0;
      },
    });

    expect(() => createStructuredInput(sparse)).toThrowError(TypeError);
    expect(reads).toBe(0);
  });

  it("accepts a large legitimate voice geometry and freezes its snapshot", () => {
    const bar = Array.from({ length: 512 }, (_, chordIndex) =>
      Array.from(
        { length: 128 },
        (_, voiceIndex) => chordIndex + voiceIndex / 128,
      ),
    );
    const input = createStructuredInput(bar);

    expect(Object.isFrozen(input)).toBe(true);
    expect(Object.isFrozen(input.values)).toBe(true);
    const storedBar = input.values[0];
    if (!Array.isArray(storedBar)) throw new Error("Expected stored bar");
    expect(Object.isFrozen(storedBar)).toBe(true);
    expect(storedBar).toHaveLength(512);
    for (const chord of storedBar) {
      if (!Array.isArray(chord)) throw new Error("Expected stored chord");
      expect(chord).toHaveLength(128);
      expect(Object.isFrozen(chord)).toBe(true);
    }
  });
});
