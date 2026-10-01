import {
  assertPatternExpressionLimits,
  evaluatePatternExpression,
  MAX_EVENT_CYCLE_PATTERNS,
  MAX_EVENT_GROUP_VOICES,
  MAX_EXPRESSION_NODES,
  type AtomInterpretation,
  type PatternExpression,
  type PatternNode,
} from "@web-audio/patterns";
import { isRandomCycle } from "@/utils/validate";
import { decodeRandomEventInput } from "./decode-random-input";

// Bound raw traversal independently of emitted nodes and surviving voices.
// Count argument, bar, and chord slots, including holes and omitted placeholders.
const MAX_STRUCTURED_INPUT_ITEMS = 65_536;

// These are internal validation boundaries, intentionally accepting unknown
// leaves. Public fluent signatures and production dispatch remain unchanged.
type StructuredDecodeOptions<T> = {
  readonly method: string;
  readonly interpretValue: (value: unknown) => AtomInterpretation<T>;
  readonly allowNullRest?: boolean;
  readonly allowUndefinedRest?: boolean;
  readonly allowPolyphony?: boolean;
  readonly omitNullableVoices?: boolean;
  readonly randomPatternError?: string;
};

function isArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

/** Decode method arguments as bars, entries as slots, and nested arrays as voices. */
function decodeStructuredInput<T>(
  input: readonly unknown[],
  options: StructuredDecodeOptions<T>,
) {
  const fail = (message: string) => new Error(`${options.method} ${message}`);
  if (input.length === 0) throw fail("requires at least one pattern.");
  if (input.length > MAX_EVENT_CYCLE_PATTERNS) {
    throw fail(
      `cannot contain more than ${MAX_EVENT_CYCLE_PATTERNS} patterns.`,
    );
  }
  let remainingInputItems = MAX_STRUCTURED_INPUT_ITEMS;
  const reserveInputItems = (length: number) => {
    if (length > remainingInputItems) {
      throw fail(
        `structured input contains more than ${MAX_STRUCTURED_INPUT_ITEMS} raw items.`,
      );
    }
    remainingInputItems -= length;
  };
  reserveInputItems(input.length);
  if (input.some(isRandomCycle)) {
    throw fail(
      options.randomPatternError ??
        "random patterns must bypass structured decoding and be the sole argument.",
    );
  }
  let nodeCount = 0;
  const reserveNode = () => {
    if (++nodeCount > MAX_EXPRESSION_NODES) {
      throw fail(
        `expression contains more than ${MAX_EXPRESSION_NODES} nodes.`,
      );
    }
  };
  const silence = () => {
    reserveNode();
    return Object.freeze({ type: "rest" } as const);
  };
  const decodeValue = (value: unknown) => {
    if (
      (value === null && options.allowNullRest !== false) ||
      (value === undefined && options.allowUndefinedRest)
    )
      return silence();
    const interpreted = options.interpretValue(value);
    if (interpreted.type === "rest") return silence();
    reserveNode();
    return Object.freeze({ type: "atom", value: interpreted.value } as const);
  };
  const decodeSlot = (value: unknown) => {
    if (!isArray(value)) return decodeValue(value);
    if (options.allowPolyphony === false) {
      throw fail("does not support simultaneous voice groups.");
    }
    if (value.length === 0)
      throw fail("simultaneous voice groups cannot be empty.");
    // Charge the whole array before iteration, even if every voice is absent.
    reserveInputItems(value.length);
    // Existing note chords may contain nullable placeholders. Omit absent
    // voices before forming a parallel node, never emit rest voices into it.
    const voices: unknown[] = [];
    for (const voice of value) {
      if (options.omitNullableVoices && (voice === null || voice === undefined))
        continue;
      if (voices.length === MAX_EVENT_GROUP_VOICES) {
        throw fail(
          `simultaneous groups cannot contain more than ${MAX_EVENT_GROUP_VOICES} voices.`,
        );
      }
      voices.push(voice);
    }
    if (voices.length === 0) return silence();
    reserveNode();
    const children = Array.from(voices, (voice) => {
      if (isArray(voice)) {
        throw fail("simultaneous voices cannot contain extra array nesting.");
      }
      if (voice === null || voice === undefined) {
        throw fail(
          "null and undefined are only allowed as a whole-hit rest, not simultaneous voices.",
        );
      }
      const node = decodeValue(voice);
      if (node.type === "rest")
        throw fail("rests cannot be simultaneous voices.");
      return node;
    });
    return Object.freeze({
      type: "parallel",
      children: Object.freeze(children),
    } as const);
  };
  const patterns: PatternNode<T>[] = Array.from(input, (bar) => {
    if (!isArray(bar)) return decodeValue(bar);
    if (bar.length === 0) return silence();
    reserveNode();
    if (bar.length > MAX_EXPRESSION_NODES - nodeCount) {
      throw fail(
        `expression contains more than ${MAX_EXPRESSION_NODES} nodes.`,
      );
    }
    reserveInputItems(bar.length);
    // Array.from treats sparse entries as undefined rather than creating holes
    // in the expression. Each consumer decides whether undefined is a rest.
    const children = Array.from(bar, decodeSlot);
    return Object.freeze({
      type: "sequence",
      children: Object.freeze(children),
    } as const);
  });
  const expression = Object.freeze({
    type: "pattern-expression",
    patterns: Object.freeze(patterns),
  } as const satisfies PatternExpression<T>);
  assertPatternExpressionLimits(expression);
  return expression;
}

function finiteNumberInterpreter(method: string) {
  return (value: unknown) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`${method} values must be finite numbers.`);
    }
    return { type: "event", value } as const;
  };
}

function decodeNotesExpression(input: readonly unknown[]) {
  return decodeStructuredInput(input, {
    method: "[Instrument] notes()",
    interpretValue: finiteNumberInterpreter("[Instrument] notes()"),
    allowUndefinedRest: true,
    omitNullableVoices: true,
  });
}

function decodeSampleNamesExpression(input: readonly unknown[]) {
  return decodeStructuredInput(input, {
    method: "[Sampler] name()",
    randomPatternError: "does not support random patterns.",
    interpretValue: (value) => {
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error(
          "[Sampler] name() sample names must be non-empty strings.",
        );
      }
      // Alphanumeric-only aliases and ':' rejection land together in Step 7.3.
      return { type: "event", value: value.trim() } as const;
    },
  });
}

function decodeVariationsExpression(input: readonly unknown[]) {
  return decodeStructuredInput(input, {
    method: "[Sampler] variation()",
    interpretValue: finiteNumberInterpreter("[Sampler] variation()"),
  });
}

function decodeNotesInput(input: readonly unknown[]) {
  if (input.length === 1 && isRandomCycle(input[0]))
    return decodeRandomEventInput(input[0]);
  return evaluatePatternExpression(decodeNotesExpression(input));
}

function decodeSampleNamesInput(input: readonly unknown[]) {
  return evaluatePatternExpression(decodeSampleNamesExpression(input));
}

function decodeVariationsInput(input: readonly unknown[]) {
  if (input.length === 1 && isRandomCycle(input[0]))
    return decodeRandomEventInput(input[0]);
  return evaluatePatternExpression(decodeVariationsExpression(input));
}

export {
  MAX_STRUCTURED_INPUT_ITEMS,
  decodeStructuredInput,
  decodeNotesExpression,
  decodeSampleNamesExpression,
  decodeVariationsExpression,
  decodeNotesInput,
  decodeSampleNamesInput,
  decodeVariationsInput,
};
