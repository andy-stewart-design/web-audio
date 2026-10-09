import { MAX_EXPRESSION_DEPTH } from "../limits";
import {
  assertPatternExpressionLimits,
  type PatternExpression,
  type PatternNode,
} from "../expressions/model";
import { shorthandSyntaxError } from "./errors";
import {
  lexShorthand,
  type ShorthandOperator,
  type ShorthandToken,
} from "./lexer";

type Delimiter = "[" | "]" | "<" | ">" | ",";

type Parser = {
  readonly source: string;
  readonly tokens: readonly ShorthandToken[];
  index: number;
};

function parseShorthand(source: string) {
  const tokens = lexShorthand(source);
  if (tokens.length === 0) {
    throw shorthandSyntaxError(
      source,
      { start: 0, end: source.length },
      "Shorthand expression cannot be empty; use '~' for silence",
    );
  }

  const parser: Parser = { source, tokens, index: 0 };
  const root = parseSequence(parser, 1, undefined);
  if (parser.index !== tokens.length) {
    throw unexpectedToken(parser, tokens[parser.index]);
  }

  const expression: PatternExpression<string> = {
    type: "pattern-expression",
    patterns: [root],
    range: { start: 0, end: source.length },
  };
  assertPatternExpressionLimits(expression);
  return expression;
}

function parseSequence(
  parser: Parser,
  depth: number,
  terminator: Delimiter | undefined,
) {
  const children: PatternNode<string>[] = [];
  let previousEnd: number | undefined;

  while (parser.index < parser.tokens.length) {
    const token = parser.tokens[parser.index];
    if (terminator && isDelimiter(token, terminator)) break;
    if (isClosingDelimiter(token)) break;
    if (token.type === "delimiter" && token.delimiter === ",") {
      throw syntaxErrorAtToken(
        parser,
        token,
        "Commas are valid only inside square groups",
      );
    }

    const node = parseNode(parser, depth);
    if (
      previousEnd !== undefined &&
      node.range &&
      node.range.start === previousEnd
    ) {
      throw shorthandSyntaxError(
        parser.source,
        node.range,
        "Whitespace is required between sequential nodes",
      );
    }
    children.push(node);
    previousEnd = node.range?.end;
  }

  if (children.length === 0) {
    const token = parser.tokens[parser.index];
    const range = token?.range ?? {
      start: parser.source.length,
      end: parser.source.length,
    };
    throw shorthandSyntaxError(
      parser.source,
      range,
      "Sequences cannot be empty; use '~' for silence",
    );
  }

  return children.length === 1
    ? children[0]
    : sequenceNode(
        children,
        children[0].range!.start,
        children.at(-1)!.range!.end,
      );
}

function parseNode(parser: Parser, depth: number): PatternNode<string> {
  assertDepth(parser, depth);
  const node = parsePrimary(parser, depth);
  let current = node;

  while (parser.tokens[parser.index]?.type === "operator") {
    const operator = parser.tokens[parser.index];
    if (operator.type !== "operator") break;
    if (current.range?.end !== operator.range.start) {
      throw syntaxErrorAtToken(
        parser,
        operator,
        "Postfix operators must immediately follow their operand",
      );
    }
    parser.index++;
    const amount = parser.tokens[parser.index];
    if (!amount || amount.type !== "atom") {
      const range = amount?.range ?? operator.range;
      throw shorthandSyntaxError(
        parser.source,
        range,
        `Modifier '${operatorText(operator.operator)}' requires an amount`,
      );
    }
    if (amount.range.start !== operator.range.end) {
      throw shorthandSyntaxError(
        parser.source,
        amount.range,
        "Modifier amounts must immediately follow their operator",
      );
    }
    parser.index++;
    current = modifierNode(
      operator.operator,
      amount.value,
      current,
      current.range!.start,
      amount.range.end,
    );
  }

  return current;
}

function parsePrimary(parser: Parser, depth: number): PatternNode<string> {
  const token = parser.tokens[parser.index];
  if (!token) {
    throw shorthandSyntaxError(
      parser.source,
      { start: parser.source.length, end: parser.source.length },
      "Expected a pattern node",
    );
  }

  if (token.type === "atom") {
    parser.index++;
    return { type: "atom", value: token.value, range: token.range };
  }
  if (token.type === "rest") {
    parser.index++;
    return { type: "rest", range: token.range };
  }
  if (token.type === "operator") {
    throw syntaxErrorAtToken(
      parser,
      token,
      `Modifier '${operatorText(token.operator)}' has no operand`,
    );
  }
  if (token.delimiter === "[") return parseSquareGroup(parser, depth);
  if (token.delimiter === "<") return parseAlternate(parser, depth);
  throw unexpectedToken(parser, token);
}

function parseSquareGroup(parser: Parser, depth: number): PatternNode<string> {
  const opening = expectDelimiter(parser, "[");
  const children: PatternNode<string>[] = [];
  let mode: "sequence" | "parallel" | undefined;
  let previousEnd = opening.range.end;
  let afterComma = false;

  while (parser.index < parser.tokens.length) {
    const next = parser.tokens[parser.index];
    if (isDelimiter(next, "]")) break;
    if (next.type === "delimiter" && next.delimiter === ",") {
      if (children.length === 0 || afterComma) {
        throw syntaxErrorAtToken(
          parser,
          next,
          "A simultaneous group cannot contain an empty voice",
        );
      }
      if (mode === "sequence") {
        throw syntaxErrorAtToken(
          parser,
          next,
          "Square groups cannot mix sequencing and simultaneous voices",
        );
      }
      if (children.some(isRestLike)) {
        throw shorthandSyntaxError(
          parser.source,
          children.find((child) => isRestLike(child))!.range!,
          "Rests cannot be simultaneous voices",
        );
      }
      const invalidVoice = children.find((child) => !isParallelVoice(child));
      if (invalidVoice) {
        throw shorthandSyntaxError(
          parser.source,
          invalidVoice.range!,
          "Simultaneous voices must be atoms or grouped simultaneous voices, not sequential or time-varying structures",
        );
      }
      mode = "parallel";
      parser.index++;
      afterComma = true;
      if (
        isDelimiter(parser.tokens[parser.index], "]") ||
        !parser.tokens[parser.index]
      ) {
        const range = parser.tokens[parser.index]?.range ?? next.range;
        throw shorthandSyntaxError(
          parser.source,
          range,
          "A simultaneous group cannot end with a comma",
        );
      }
      continue;
    }
    if (mode === "parallel" && children.length > 0 && !afterComma) {
      throw syntaxErrorAtToken(
        parser,
        next,
        "Square groups cannot mix sequencing and simultaneous voices",
      );
    }

    const child = parseNode(parser, depth + 1);
    if (children.length > 0 && mode === undefined) mode = "sequence";
    if (
      children.length > 0 &&
      mode !== "parallel" &&
      child.range?.start === previousEnd
    ) {
      throw shorthandSyntaxError(
        parser.source,
        child.range,
        "Whitespace is required between sequential nodes",
      );
    }
    if (mode === "parallel" && isRestLike(child)) {
      throw shorthandSyntaxError(
        parser.source,
        child.range!,
        "Rests cannot be simultaneous voices",
      );
    }
    if (mode === "parallel" && !isParallelVoice(child)) {
      throw shorthandSyntaxError(
        parser.source,
        child.range!,
        "Simultaneous voices must be atoms or grouped simultaneous voices, not sequential or time-varying structures",
      );
    }
    children.push(child);
    previousEnd = child.range?.end ?? previousEnd;
    afterComma = false;
  }

  const closing = expectDelimiter(parser, "]");
  if (children.length === 0) {
    throw shorthandSyntaxError(
      parser.source,
      { start: opening.range.start, end: closing.range.end },
      "Square groups cannot be empty; use '~' for silence",
    );
  }

  const child =
    mode === "parallel"
      ? ({
          type: "parallel",
          children,
          range: {
            start: children[0].range!.start,
            end: children.at(-1)!.range!.end,
          },
        } as const)
      : children.length === 1
        ? children[0]
        : sequenceNode(
            children,
            children[0].range!.start,
            children.at(-1)!.range!.end,
          );
  return {
    type: "group",
    child,
    range: { start: opening.range.start, end: closing.range.end },
  };
}

function parseAlternate(parser: Parser, depth: number): PatternNode<string> {
  const opening = expectDelimiter(parser, "<");
  const children: PatternNode<string>[] = [];
  let previousEnd = opening.range.end;

  while (parser.index < parser.tokens.length) {
    if (isDelimiter(parser.tokens[parser.index], ">")) break;
    const token = parser.tokens[parser.index];
    if (token.type === "delimiter" && token.delimiter === ",") {
      throw syntaxErrorAtToken(
        parser,
        token,
        "Commas are not valid inside alternation; use square groups for voices",
      );
    }
    const child = parseNode(parser, depth + 1);
    if (children.length > 0 && child.range?.start === previousEnd) {
      throw shorthandSyntaxError(
        parser.source,
        child.range,
        "Whitespace is required between alternation choices",
      );
    }
    children.push(child);
    previousEnd = child.range?.end ?? previousEnd;
  }

  const closing = expectDelimiter(parser, ">");
  if (children.length === 0) {
    throw shorthandSyntaxError(
      parser.source,
      { start: opening.range.start, end: closing.range.end },
      "Alternations cannot be empty; use '~' for silence",
    );
  }
  return {
    type: "alternate",
    children,
    range: { start: opening.range.start, end: closing.range.end },
  };
}

function sequenceNode(
  children: readonly PatternNode<string>[],
  start: number,
  end: number,
) {
  return { type: "sequence", children, range: { start, end } } as const;
}

function modifierNode(
  operator: ShorthandOperator,
  amount: string,
  child: PatternNode<string>,
  start: number,
  end: number,
) {
  return {
    type: "modifier",
    operator,
    amount,
    child,
    range: { start, end },
  } as const;
}

function expectDelimiter(parser: Parser, delimiter: Delimiter) {
  const token = parser.tokens[parser.index];
  if (!isDelimiter(token, delimiter)) {
    const range = token?.range ?? {
      start: parser.source.length,
      end: parser.source.length,
    };
    throw shorthandSyntaxError(
      parser.source,
      range,
      `Expected '${delimiter}' before the end of the expression`,
    );
  }
  parser.index++;
  return token;
}

function isDelimiter<D extends Delimiter>(
  token: ShorthandToken | undefined,
  delimiter: D,
): token is Extract<
  ShorthandToken,
  { readonly type: "delimiter"; readonly delimiter: D }
> {
  return token?.type === "delimiter" && token.delimiter === delimiter;
}

function isClosingDelimiter(token: ShorthandToken) {
  return (
    token.type === "delimiter" &&
    (token.delimiter === "]" || token.delimiter === ">")
  );
}

function isRestLike(node: PatternNode<string>): boolean {
  if (node.type === "rest") return true;
  if (node.type === "group" || node.type === "modifier")
    return isRestLike(node.child);
  return false;
}

function isParallelVoice(node: PatternNode<string>): boolean {
  switch (node.type) {
    case "atom":
      return true;
    case "group":
      return isParallelVoice(node.child);
    case "parallel":
      return node.children.every(isParallelVoice);
    default:
      return false;
  }
}

function assertDepth(parser: Parser, depth: number) {
  if (depth > MAX_EXPRESSION_DEPTH) {
    const token = parser.tokens[parser.index];
    const range = token?.range ?? {
      start: parser.source.length,
      end: parser.source.length,
    };
    throw shorthandSyntaxError(
      parser.source,
      range,
      `Expression exceeds the maximum depth of ${MAX_EXPRESSION_DEPTH}`,
    );
  }
}

function unexpectedToken(parser: Parser, token: ShorthandToken): never {
  const description =
    token.type === "atom"
      ? `'${token.value}'`
      : token.type === "delimiter"
        ? `'${token.delimiter}'`
        : token.type === "operator"
          ? `'${operatorText(token.operator)}'`
          : "rest";
  throw syntaxErrorAtToken(parser, token, `Unexpected token ${description}`);
}

function syntaxErrorAtToken(
  parser: Parser,
  token: ShorthandToken,
  message: string,
): never {
  throw shorthandSyntaxError(parser.source, token.range, message);
}

function operatorText(operator: ShorthandOperator) {
  switch (operator) {
    case "repeat":
      return "!";
    case "accelerate":
      return "*";
    case "slow":
      return "/";
    case "weight":
      return "@";
  }
}

export { parseShorthand };
