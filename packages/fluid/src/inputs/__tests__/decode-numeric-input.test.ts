import { RandomCycle } from "@web-audio/patterns";
import { describe, expect, it } from "vitest";
import { decodeNumericInput } from "@/inputs/decode-numeric-input";

function decodeRuntimeInput(input: readonly unknown[]) {
  return Reflect.apply(decodeNumericInput, undefined, [input]);
}

describe("numeric input decoding", () => {
  it.each([
    {
      input: [1, 0, -0.5],
      expected: [[1], [0], [-0.5]],
    },
    {
      input: [[1, 0, 0.5]],
      expected: [[1, 0, 0.5]],
    },
    {
      input: [],
      expected: [],
    },
  ])("normalizes $input without validating values", ({ input, expected }) => {
    expect(decodeRuntimeInput(input)).toEqual(expected);
  });

  it("retains authored bars and sparse values by reference", () => {
    const bar = [1, 2];
    const sparse = new Array<number>(3);
    sparse[0] = 1;
    sparse[2] = 2;

    const decoded = decodeNumericInput([bar, sparse]);
    if (decoded instanceof RandomCycle)
      throw new Error("expected numeric bars");

    expect(decoded).toEqual([bar, sparse]);
    expect(decoded[0]).toBe(bar);
    expect(decoded[1]).toBe(sparse);
    bar[0] = 3;
    sparse[1] = 4;
    expect(decoded).toEqual([bar, sparse]);
  });

  it("retains a sole random source reference", () => {
    const source = new RandomCycle().steps(1);
    const input: [RandomCycle] = [source];

    expect(decodeNumericInput(input)).toBe(source);
  });

  it("leaves invalid structured shapes for the existing validation stage", () => {
    const emptyBar: number[] = [];
    const nullishAndNonFinite = [null, undefined, Number.NaN, Infinity];
    const mixedRandom = [new RandomCycle(), 1];

    expect(decodeRuntimeInput([emptyBar])).toEqual([emptyBar]);
    expect(decodeRuntimeInput([emptyBar])[0]).toBe(emptyBar);
    expect(decodeRuntimeInput(nullishAndNonFinite)).toEqual([
      [null],
      [undefined],
      [Number.NaN],
      [Infinity],
    ]);
    expect(decodeRuntimeInput(mixedRandom)).toEqual([[mixedRandom[0]], [1]]);
  });
});
