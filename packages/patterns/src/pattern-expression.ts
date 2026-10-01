import {
  MAX_EXPRESSION_DEPTH,
  MAX_EXPRESSION_NODES,
} from "./utils/cycle-limits";

/** Explicit authored bars shared by structured decoding and shorthand parsing. */
type PatternExpression<T> = {
  readonly type: "pattern-expression";
  readonly patterns: readonly PatternNode<T>[];
  readonly range?: PatternRange;
};

type PatternNode<T> =
  | PatternAtom<T>
  | PatternRest
  | PatternSequence<T>
  | PatternGroup<T>
  | PatternParallel<T>
  | PatternAlternate<T>
  | PatternModifier<T>;

/** Half-open source offsets in JavaScript string (UTF-16) code units. */
type PatternRange = {
  readonly start: number;
  readonly end: number;
};

type PatternAtom<T> = {
  readonly type: "atom";
  readonly value: T;
  readonly range?: PatternRange;
};

type PatternRest = {
  readonly type: "rest";
  readonly range?: PatternRange;
};

type PatternSequence<T> = {
  readonly type: "sequence";
  readonly children: readonly PatternNode<T>[];
  readonly range?: PatternRange;
};

type PatternGroup<T> = {
  readonly type: "group";
  readonly child: PatternNode<T>;
  readonly range?: PatternRange;
};

type PatternParallel<T> = {
  readonly type: "parallel";
  readonly children: readonly PatternNode<T>[];
  readonly range?: PatternRange;
};

type PatternAlternate<T> = {
  readonly type: "alternate";
  readonly children: readonly PatternNode<T>[];
  readonly range?: PatternRange;
};

type PatternModifier<T> = {
  readonly type: "modifier";
  readonly operator: "repeat" | "accelerate" | "slow" | "weight";
  /** Keep the authored lexeme; rational interpretation belongs to evaluation. */
  readonly amount: string;
  readonly child: PatternNode<T>;
  readonly range?: PatternRange;
};

/**
 * Check structural bounds without interpreting atoms, validating grammar, or
 * mutating the tree. Root patterns start at depth 1; the expression wrapper is
 * not a node. Shared subtrees count once per occurrence, as evaluation uses them.
 */
function assertPatternExpressionLimits<T>(expression: PatternExpression<T>) {
  let nodeCount = 0;
  const stack = [{ nodes: expression.patterns, index: 0, depth: 1 }];

  // Cursor frames keep memory proportional to depth, even for very wide trees.
  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    if (frame.index === frame.nodes.length) {
      stack.pop();
      continue;
    }

    const node = frame.nodes[frame.index++];
    nodeCount++;
    if (nodeCount > MAX_EXPRESSION_NODES) {
      throw new Error(
        `[Pattern] Expression contains more than ${MAX_EXPRESSION_NODES} nodes.`,
      );
    }
    if (frame.depth > MAX_EXPRESSION_DEPTH) {
      throw new Error(
        `[Pattern] Expression exceeds the maximum depth of ${MAX_EXPRESSION_DEPTH}.`,
      );
    }

    switch (node.type) {
      case "atom":
      case "rest":
        break;
      case "group":
      case "modifier":
        stack.push({ nodes: [node.child], index: 0, depth: frame.depth + 1 });
        break;
      case "sequence":
      case "parallel":
      case "alternate":
        stack.push({ nodes: node.children, index: 0, depth: frame.depth + 1 });
        break;
    }
  }
}

export { assertPatternExpressionLimits };
export type {
  PatternExpression,
  PatternNode,
  PatternRange,
  PatternAtom,
  PatternRest,
  PatternSequence,
  PatternGroup,
  PatternParallel,
  PatternAlternate,
  PatternModifier,
};
