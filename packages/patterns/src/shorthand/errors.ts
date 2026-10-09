import type { PatternRange } from "../expressions/model";

class ShorthandSyntaxError extends SyntaxError {
  readonly source: string;
  readonly range: PatternRange;

  constructor(message: string, source: string, range: PatternRange) {
    super(
      `[Pattern] ${message} at source range [${range.start}, ${range.end}).`,
    );
    this.name = "ShorthandSyntaxError";
    this.source = source;
    this.range = Object.freeze({ ...range });
  }
}

function shorthandSyntaxError(
  source: string,
  range: PatternRange,
  message: string,
) {
  return new ShorthandSyntaxError(message, source, range);
}

export { ShorthandSyntaxError, shorthandSyntaxError };
