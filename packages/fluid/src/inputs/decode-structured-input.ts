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
import { isRandomCycle } from "./guards";
import { decodeRandomEventInputGeometry } from "./decode-random-input";
import { decodeShorthandInput } from "./decode-shorthand-input";
import {
  interpretNoteAtom,
  interpretSampleNameAtom,
  interpretVariationAtom,
} from "./atom-interpreters";
import { isAlias } from "@/samples/normalize-bank";
import { normalizeStructuredInput } from "./normalize-structured-input";

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
  readonly allowEmptyVoiceRest?: boolean;
  readonly randomPatternError?: string;
};

function isArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function assertPatternArgumentLimit(input: readonly unknown[], method: string) {
  if (input.length > MAX_EVENT_CYCLE_PATTERNS) {
    throw new Error(
      `${method} cannot contain more than ${MAX_EVENT_CYCLE_PATTERNS} patterns.`,
    );
  }
}

/** Decode method arguments as bars, entries as slots, and nested arrays as voices. */
function decodeStructuredInputGeometry<T>(
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
    if (value.length === 0) {
      if (options.allowEmptyVoiceRest) return silence();
      throw fail("simultaneous voice groups cannot be empty.");
    }
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
      if (voice === null) {
        throw fail("null is only allowed as a whole-hit rest.");
      }
      if (voice === undefined) {
        throw fail("undefined is only allowed as a whole-hit rest.");
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
  const zeroWidthPatterns: boolean[] = [];
  const patterns: PatternNode<T>[] = Array.from(input, (bar, index) => {
    zeroWidthPatterns[index] = isArray(bar) && bar.length === 0;
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
  return Object.freeze({
    expression,
    zeroWidthPatterns: Object.freeze(zeroWidthPatterns),
  });
}

function decodeStructuredInput<T>(
  input: readonly unknown[],
  options: StructuredDecodeOptions<T>,
) {
  return decodeStructuredInputGeometry(input, options).expression;
}

function finiteNumberInterpreter(method: string) {
  return (value: unknown) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`${method} values must be finite numbers.`);
    }
    return { type: "event", value } as const;
  };
}

function notesDecodeOptions() {
  return {
    method: "[Instrument] notes()",
    interpretValue: finiteNumberInterpreter("[Instrument] notes()"),
    allowUndefinedRest: true,
    omitNullableVoices: true,
    // Legacy structured notes treat [] chords as silence, never empty events.
    allowEmptyVoiceRest: true,
  } as const;
}

function decodeNotesExpression(input: readonly unknown[]) {
  return decodeStructuredInput(input, notesDecodeOptions());
}

function decodeSampleNamesExpression(input: readonly unknown[]) {
  return decodeStructuredInput(input, {
    method: "[Sampler] name()",
    randomPatternError: "does not support random patterns.",
    interpretValue: (value) => {
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("[Sampler] name() sample names must be non-empty.");
      }
      const normalized = value.trim();
      if (!isAlias(normalized)) {
        throw new Error(
          "[Sampler] name() sample names must match [A-Za-z0-9]+.",
        );
      }
      return { type: "event", value: normalized } as const;
    },
  });
}

function decodeVariationsExpression(input: readonly unknown[]) {
  return decodeStructuredInput(input, {
    method: "[Sampler] variation()",
    interpretValue: finiteNumberInterpreter("[Sampler] variation()"),
  });
}

// Structured nulls are authored value placeholders; shorthand rests and
// continuations are timing-only cells and must not consume note values.
function createNoteValueSlots(
  cycle: ReturnType<typeof evaluatePatternExpression>,
  zeroWidthPatterns: readonly boolean[],
  preserveRestSlots: boolean,
) {
  return Object.freeze({
    type: "static-event-cycle",
    patterns: Object.freeze(
      cycle.patterns.map((pattern, index) =>
        Object.freeze(
          pattern.map((step) =>
            zeroWidthPatterns[index] ||
            step.type === "continuation" ||
            (step.type === "rest" && !preserveRestSlots)
              ? ({ type: "rest" } as const)
              : Object.freeze({
                  type: "event",
                  values: Object.freeze([1] as const),
                } as const),
          ),
        ),
      ),
    ),
  } as const);
}

function decodeNotesInputGeometry(
  input: readonly unknown[],
  { allowShorthand = false } = {},
) {
  const normalized = normalizeStructuredInput(input, "[Instrument] notes()", {
    scanBudget: MAX_STRUCTURED_INPUT_ITEMS,
  });
  const values = normalized ?? input;
  if (normalized === undefined)
    assertPatternArgumentLimit(input, "[Instrument] notes()");
  if (normalized === undefined && allowShorthand) {
    const shorthand = decodeShorthandInput(input, "[Instrument] notes()");
    if (shorthand) {
      const cycle = evaluatePatternExpression(
        shorthand.expression,
        interpretNoteAtom,
      );
      const zeroWidthPatterns = Object.freeze(cycle.patterns.map(() => false));
      return Object.freeze({
        cycle,
        zeroWidthPatterns,
        noteValueSlots: createNoteValueSlots(cycle, zeroWidthPatterns, false),
      });
    }
  }
  if (normalized === undefined && isRandomCycle(input[0]))
    return decodeRandomEventInputGeometry(input[0]);
  const geometry = decodeStructuredInputGeometry(values, notesDecodeOptions());
  const cycle = evaluatePatternExpression(geometry.expression);
  return Object.freeze({
    cycle,
    zeroWidthPatterns: geometry.zeroWidthPatterns,
    noteValueSlots: createNoteValueSlots(
      cycle,
      geometry.zeroWidthPatterns,
      true,
    ),
  });
}

function decodeNotesInput(input: readonly unknown[]) {
  return decodeNotesInputGeometry(input).cycle;
}

function decodeSampleNamesInput(
  input: readonly unknown[],
  { allowShorthand = false } = {},
) {
  const normalized = normalizeStructuredInput(input, "[Sampler] name()", {
    scanBudget: MAX_STRUCTURED_INPUT_ITEMS,
  });
  const values = normalized ?? input;
  if (normalized === undefined)
    assertPatternArgumentLimit(input, "[Sampler] name()");
  if (normalized === undefined && allowShorthand) {
    const shorthand = decodeShorthandInput(input, "[Sampler] name()", {
      allowMultipleStrings: true,
    });
    if (shorthand) {
      return evaluatePatternExpression(
        shorthand.expression,
        interpretSampleNameAtom,
      );
    }
  }
  return evaluatePatternExpression(decodeSampleNamesExpression(values));
}

function decodeVariationsInputGeometry(
  input: readonly unknown[],
  { allowShorthand = false } = {},
) {
  const normalized = normalizeStructuredInput(input, "[Sampler] variation()", {
    scanBudget: MAX_STRUCTURED_INPUT_ITEMS,
  });
  const values = normalized ?? input;
  if (normalized === undefined)
    assertPatternArgumentLimit(input, "[Sampler] variation()");
  if (normalized === undefined && allowShorthand) {
    const shorthand = decodeShorthandInput(input, "[Sampler] variation()");
    if (shorthand) {
      const cycle = evaluatePatternExpression(
        shorthand.expression,
        interpretVariationAtom,
      );
      return Object.freeze({
        cycle,
        zeroWidthPatterns: Object.freeze(cycle.patterns.map(() => false)),
      });
    }
  }
  if (normalized === undefined && isRandomCycle(input[0]))
    return decodeRandomEventInputGeometry(input[0]);
  const cycle = evaluatePatternExpression(decodeVariationsExpression(values));
  // Unlike notes, empty static name/variation bars normalize to authored rests.
  return Object.freeze({
    cycle,
    zeroWidthPatterns: Object.freeze(cycle.patterns.map(() => false)),
  });
}

function decodeVariationsInput(input: readonly unknown[]) {
  return decodeVariationsInputGeometry(input).cycle;
}

export {
  MAX_STRUCTURED_INPUT_ITEMS,
  decodeStructuredInput,
  decodeStructuredInputGeometry,
  decodeNotesInputGeometry,
  decodeNotesExpression,
  decodeSampleNamesExpression,
  decodeVariationsExpression,
  decodeNotesInput,
  decodeSampleNamesInput,
  decodeVariationsInput,
  decodeVariationsInputGeometry,
};
