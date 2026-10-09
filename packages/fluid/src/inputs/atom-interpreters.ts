import type { AtomInterpreter, PatternRange } from "@web-audio/patterns";

const STRICT_FINITE_NUMBER =
  /^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?$/;
const SAMPLE_ALIAS = /^[A-Za-z0-9]+$/;

function targetAtomError(
  method: string,
  message: string,
  range?: PatternRange,
) {
  const location = range
    ? ` at source range [${range.start}, ${range.end})`
    : "";
  return new Error(`${method} ${message}${location}.`);
}

function finiteNumberInterpreter(method: string) {
  const interpret: AtomInterpreter<string, number> = (value, range) => {
    if (!STRICT_FINITE_NUMBER.test(value)) {
      throw targetAtomError(
        method,
        `atom '${value}' must be a finite numeric value`,
        range,
      );
    }
    const number = Number(value);
    if (!Number.isFinite(number)) {
      throw targetAtomError(
        method,
        `atom '${value}' must be a finite numeric value`,
        range,
      );
    }
    return { type: "event", value: number };
  };
  return interpret;
}

function interpretSampleNameAtom(value: string, range?: PatternRange) {
  if (!SAMPLE_ALIAS.test(value)) {
    throw targetAtomError(
      "[Sampler] name()",
      "sample atoms must match [A-Za-z0-9]+",
      range,
    );
  }
  return { type: "event", value } as const;
}

function interpretXoxAtom(value: string, range?: PatternRange) {
  if (value === "1" || value.toLowerCase() === "x") {
    return { type: "event", value: 1 } as const;
  }
  if (value === "0" || value.toLowerCase() === "o" || value === ".") {
    return { type: "rest" } as const;
  }
  throw targetAtomError(
    "[Instrument] xox()",
    "atoms must be one of '1', 'x', '0', 'o', or '.'",
    range,
  );
}

const interpretNoteAtom = finiteNumberInterpreter("[Instrument] notes()");
const interpretVariationAtom = finiteNumberInterpreter("[Sampler] variation()");

export {
  finiteNumberInterpreter,
  interpretNoteAtom,
  interpretSampleNameAtom,
  interpretVariationAtom,
  interpretXoxAtom,
  targetAtomError,
};
