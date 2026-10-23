import {
  createShorthand,
  MAX_EXPRESSION_NODES,
  MAX_SHORTHAND_SOURCE_LENGTH,
  MAX_SHORTHAND_TOKENS,
  RandomCycle,
} from "@web-audio/patterns";
import { describe, expect, it } from "vitest";
import { decodeNumericInput } from "@/inputs/decode-numeric-input";

const MAX_EXPRESSION_DEPTH = 128;

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

  it("decodes direct and reusable shorthand into numeric bars", () => {
    const source = "0 -2 +.5 1. 1e-3";
    const reusable = createShorthand(source);

    expect(decodeNumericInput([source])).toEqual([[0, -2, 0.5, 1, 0.001]]);
    expect(decodeNumericInput([reusable])).toEqual([[0, -2, 0.5, 1, 0.001]]);
    expect(decodeNumericInput(["<0 1> 2"])).toEqual([
      [0, 2],
      [1, 2],
    ]);
  });

  it("rejects invalid numeric atoms and unsupported branches eagerly", () => {
    for (const source of [
      "NaN",
      "Infinity",
      "1e999",
      "0x10",
      "1_000",
      "name",
      "0.2 ~ 0.8",
      "<0.2 [0.8 ~]>",
      "0.2*2",
      "[0.2,0.8]",
    ]) {
      expect(() => decodeNumericInput([source]), source).toThrow();
    }
    expect(() => decodeNumericInput(["1e999"], "[Gain] gain()")).toThrow(
      "[Gain] gain() atom '1e999' must be a finite numeric value at source range [0, 5)",
    );
  });

  it.each([
    ["", "Shorthand expression cannot be empty", "[0, 0)"],
    ["[1", "Expected ']'", "[2, 2)"],
    ["~", "Rests are not supported in numeric patterns", "[0, 1)"],
    ["1*2", "Modifier 'accelerate' is not supported", "[0, 3)"],
  ] as const)(
    "adds the receiving method to shorthand %j errors without losing ranges",
    (source, detail, range) => {
      const method = "[Filter] frequency()";
      let thrown: unknown;
      try {
        decodeNumericInput([source], method);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(Error);
      if (!(thrown instanceof Error))
        throw new Error("Expected a shorthand error");
      expect(thrown).toMatchObject({ cause: expect.any(Error) });
      expect(thrown.message).toContain(`${method} [Pattern]`);
      expect(thrown.message).toContain(detail);
      expect(thrown.message).toContain(`at source range ${range}`);
      expect(thrown.message).not.toContain(`${method} ${method}`);
      expect(thrown.cause).toMatchObject({
        message: expect.stringContaining("[Pattern]"),
      });
    },
  );

  it("uses the default Parameter context for unsupported reusable shorthand", () => {
    const reusable = createShorthand("1*2");

    expect(() => decodeNumericInput([reusable])).toThrow(
      "[Parameter] [Pattern] Modifier 'accelerate' is not supported in numeric patterns.",
    );
  });

  it("rejects mixed and nested shorthand at the numeric boundary", () => {
    const reusable = createShorthand("1");
    for (const input of [
      ["1", 2],
      ["1", "2"],
      [reusable, 2],
      [reusable, new RandomCycle()],
      [["1"]],
      [[reusable]],
      [[reusable], 2],
      [new RandomCycle(), "1"],
    ]) {
      expect(() => decodeRuntimeInput(input), String(input)).toThrow(
        "shorthand input must be the sole argument",
      );
    }
  });

  it("passes shared source and expression limits through the numeric path", () => {
    const cases = [
      [
        "0".repeat(MAX_SHORTHAND_SOURCE_LENGTH + 1),
        `maximum length of ${MAX_SHORTHAND_SOURCE_LENGTH}`,
      ],
      [
        Array.from({ length: MAX_SHORTHAND_TOKENS + 1 }, () => "0").join(" "),
        `more than ${MAX_SHORTHAND_TOKENS} tokens`,
      ],
      [
        Array.from({ length: MAX_EXPRESSION_NODES }, () => "0").join(" "),
        `more than ${MAX_EXPRESSION_NODES} nodes`,
      ],
      [
        "[".repeat(MAX_EXPRESSION_DEPTH + 1) +
          "0" +
          "]".repeat(MAX_EXPRESSION_DEPTH + 1),
        `maximum depth of ${MAX_EXPRESSION_DEPTH}`,
      ],
    ] as const;

    for (const [source, message] of cases) {
      expect(() => decodeNumericInput([source]), message).toThrow(message);
    }
  });

  it("does not mutate reusable shorthand during evaluation", () => {
    const reusable = createShorthand("<1 2> [3 4]");
    const snapshot = structuredClone(reusable);

    decodeNumericInput([reusable]);
    decodeNumericInput([reusable]);

    expect(reusable).toEqual(snapshot);
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
