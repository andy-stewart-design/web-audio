import { describe, expect, expectTypeOf, it } from "vitest";
import { scaleAliasMap } from "../get-scale";
import { parseKey } from "../parse-key";
import type { KeyNotation } from "../types";

describe("key notation", () => {
  it.each([
    { notation: "c4min", root: "c4", scale: "min" },
    { notation: "C#4dorian", root: "C#4", scale: "dorian" },
    { notation: "bb3major", root: "bb3", scale: "major" },
    { notation: "A-1mix", root: "A-1", scale: "mix" },
    { notation: "g10loc", root: "g10", scale: "loc" },
  ] as const)("splits $notation", ({ notation, root, scale }) => {
    expect(parseKey(notation)).toEqual({ root, scale });
  });

  it("supports every existing scale alias", () => {
    for (const scale of Object.keys(scaleAliasMap)) {
      expect(parseKey(`c4${scale}` as KeyNotation)).toEqual({
        root: "c4",
        scale,
      });
    }
  });

  it.each(["", "cmin", "c4", "4min", "h4min", "c4 min", "c4min!"])(
    "throws when %j cannot be split",
    (notation) => {
      expect(() => Reflect.apply(parseKey, undefined, [notation])).toThrow(
        `[Instrument] key() cannot parse "${notation}".`,
      );
    },
  );

  it("requires a note with an octave followed by an existing scale alias in TypeScript", () => {
    expectTypeOf<"c4min">().toExtend<KeyNotation>();
    expectTypeOf<"Bb-1major">().toExtend<KeyNotation>();
    expectTypeOf<"cmin">().not.toExtend<KeyNotation>();
    expectTypeOf<"c4unknown">().not.toExtend<KeyNotation>();
    expectTypeOf<"c4:min">().not.toExtend<KeyNotation>();
  });
});
