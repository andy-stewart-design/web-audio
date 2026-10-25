import { describe, expect, expectTypeOf, it } from "vitest";
import RandomCycle from "../../cycles/random-cycle";
import { createShorthand } from "../../shorthand/create";
import {
  createStructuredInput,
  isStructuredInput,
  type StructuredInput,
} from "../create";

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
});
