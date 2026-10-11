import { describe, expect, it } from "vitest";
import { createShorthand } from "../create";
import type { PatternNode } from "../../expressions/model";

function expectFrozenNode(node: PatternNode<string>) {
  expect(Object.isFrozen(node)).toBe(true);
  if (node.range) expect(Object.isFrozen(node.range)).toBe(true);
  switch (node.type) {
    case "group":
    case "modifier":
      expectFrozenNode(node.child);
      break;
    case "sequence":
    case "parallel":
    case "alternate":
      expect(Object.isFrozen(node.children)).toBe(true);
      node.children.forEach(expectFrozenNode);
      break;
    case "atom":
    case "rest":
      break;
  }
}

describe("createShorthand", () => {
  it("returns an enumerable, recursively immutable shared expression", () => {
    const shorthand = createShorthand("0 <1 2>");

    expect(shorthand).toEqual({
      type: "shorthand",
      source: "0 <1 2>",
      expression: {
        type: "pattern-expression",
        patterns: [
          {
            type: "sequence",
            children: [
              { type: "atom", value: "0", range: { start: 0, end: 1 } },
              {
                type: "alternate",
                children: [
                  { type: "atom", value: "1", range: { start: 3, end: 4 } },
                  { type: "atom", value: "2", range: { start: 5, end: 6 } },
                ],
                range: { start: 2, end: 7 },
              },
            ],
            range: { start: 0, end: 7 },
          },
        ],
        range: { start: 0, end: 7 },
      },
    });
    expect(Object.keys(shorthand)).toEqual(["type", "source", "expression"]);
    expect(Object.isFrozen(shorthand)).toBe(true);
    expect(Object.isFrozen(shorthand.expression)).toBe(true);
    expect(Object.isFrozen(shorthand.expression.patterns)).toBe(true);
    shorthand.expression.patterns.forEach(expectFrozenNode);
  });

  it("parses eagerly and preserves source errors", () => {
    expect(() => createShorthand("<>")).toThrow("Alternations cannot be empty");
    expect(() => createShorthand("<>")).toThrow("source range [0, 2)");
  });
});
