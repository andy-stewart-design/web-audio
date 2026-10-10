import type {
  PatternExpression,
  PatternNode,
  PatternRange,
} from "../expressions/model";
import { parseShorthand } from "./parser";

type Shorthand = {
  readonly type: "shorthand";
  readonly source: string;
  readonly expression: PatternExpression<string>;
};

function freezeRange(range: PatternRange | undefined) {
  if (range) Object.freeze(range);
}

function freezeNode(node: PatternNode<string>) {
  freezeRange(node.range);
  switch (node.type) {
    case "group":
    case "modifier":
      freezeNode(node.child);
      break;
    case "sequence":
    case "parallel":
    case "alternate":
      node.children.forEach(freezeNode);
      Object.freeze(node.children);
      break;
    case "atom":
    case "rest":
      break;
  }
  return Object.freeze(node);
}

function freezeExpression(expression: PatternExpression<string>) {
  freezeRange(expression.range);
  expression.patterns.forEach(freezeNode);
  Object.freeze(expression.patterns);
  return Object.freeze(expression);
}

function createShorthand(source: string): Shorthand {
  const expression = freezeExpression(parseShorthand(source));
  return Object.freeze({
    type: "shorthand" as const,
    source,
    expression,
  });
}

export { createShorthand };
export type { Shorthand };
