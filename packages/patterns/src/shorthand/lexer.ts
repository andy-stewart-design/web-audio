import type { PatternRange } from "../expressions/model";
import { MAX_SHORTHAND_SOURCE_LENGTH, MAX_SHORTHAND_TOKENS } from "../limits";
import { shorthandSyntaxError } from "./errors";

type ShorthandOperator = "repeat" | "accelerate" | "slow" | "weight";

type ShorthandToken =
  | {
      readonly type: "atom";
      readonly value: string;
      readonly range: PatternRange;
    }
  | { readonly type: "rest"; readonly range: PatternRange }
  | {
      readonly type: "operator";
      readonly operator: ShorthandOperator;
      readonly range: PatternRange;
    }
  | {
      readonly type: "delimiter";
      readonly delimiter: "[" | "]" | "<" | ">" | ",";
      readonly range: PatternRange;
    };

const operators = new Map<string, ShorthandOperator>([
  ["!", "repeat"],
  ["*", "accelerate"],
  ["/", "slow"],
  ["@", "weight"],
]);

const delimiters = new Set(["[", "]", "<", ">", ","]);
const unsupportedReserved = new Set(["?", "|", "(", ")", ":"]);

function lexShorthand(source: string) {
  if (typeof source !== "string") {
    throw new TypeError("[Pattern] Shorthand source must be a string.");
  }
  if (source.length > MAX_SHORTHAND_SOURCE_LENGTH) {
    throw shorthandSyntaxError(
      source,
      { start: MAX_SHORTHAND_SOURCE_LENGTH, end: source.length },
      `Shorthand source exceeds the maximum length of ${MAX_SHORTHAND_SOURCE_LENGTH} UTF-16 code units`,
    );
  }

  const tokens: ShorthandToken[] = [];
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    if (/\s/u.test(character)) {
      index++;
      continue;
    }

    const start = index;
    const range = () => ({ start, end: index });
    const operator = operators.get(character);
    if (operator) {
      index++;
      tokens.push({ type: "operator", operator, range: range() });
    } else if (delimiters.has(character)) {
      index++;
      tokens.push({
        type: "delimiter",
        delimiter: character as "[" | "]" | "<" | ">" | ",",
        range: range(),
      });
    } else if (character === "~") {
      index++;
      tokens.push({ type: "rest", range: range() });
    } else if (unsupportedReserved.has(character)) {
      index++;
      throw shorthandSyntaxError(
        source,
        range(),
        `Reserved character '${character}' is not supported`,
      );
    } else {
      while (index < source.length) {
        const atomCharacter = source[index];
        if (
          /\s/u.test(atomCharacter) ||
          operators.has(atomCharacter) ||
          delimiters.has(atomCharacter) ||
          atomCharacter === "~" ||
          unsupportedReserved.has(atomCharacter)
        ) {
          break;
        }
        index++;
      }
      tokens.push({
        type: "atom",
        value: source.slice(start, index),
        range: range(),
      });
    }

    if (tokens.length > MAX_SHORTHAND_TOKENS) {
      throw shorthandSyntaxError(
        source,
        tokens[tokens.length - 1].range,
        `Shorthand contains more than ${MAX_SHORTHAND_TOKENS} tokens`,
      );
    }
  }

  return tokens;
}

export { lexShorthand };
export type { ShorthandOperator, ShorthandToken };
