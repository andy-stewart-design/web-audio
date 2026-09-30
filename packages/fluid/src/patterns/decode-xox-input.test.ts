import * as patterns from "@web-audio/patterns";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import Synthesizer from "@/instruments/synthesizer";
import type { TimingChanceCondition } from "@/types";
import { decodeXoxExpression, decodeXoxInput } from "./decode-xox-input";

vi.mock("@web-audio/patterns", { spy: true });

const event = { type: "event", values: [1] } as const;
const atom = { type: "atom", value: 1 } as const;
const rest = { type: "rest" } as const;

function timing(cycle: patterns.StaticEventCycle<1>) {
  return cycle.patterns.map((bar) =>
    patterns.getEventPatternGeometry(bar).map(({ offset, duration }) => ({
      offset: offset.numerator / offset.denominator,
      duration: duration.numerator / duration.denominator,
    })),
  );
}

describe("structured numeric XOX", () => {
  it("decodes arguments as bars and array entries as sequential onset/rest nodes", () => {
    const expression = decodeXoxExpression([1, [1, 0, 1], 0, []]);
    expect(expression).toEqual({
      type: "pattern-expression",
      patterns: [
        atom,
        { type: "sequence", children: [atom, rest, atom] },
        rest,
        rest,
      ],
    });
    expectTypeOf(expression).toExtend<patterns.PatternExpression<1>>();
  });

  it.each([
    { name: "scalar onset", input: [1], expected: [[event]] },
    { name: "scalar rest", input: [0], expected: [[rest]] },
    {
      name: "separate bars",
      input: [1, 0, 1],
      expected: [[event], [rest], [event]],
    },
    {
      name: "sparse rhythm",
      input: [[1, 0, 1, 0]],
      expected: [[event, rest, event, rest]],
    },
    {
      name: "silent and unequal bars",
      input: [[], [0, 0], [1, 0, 1]],
      expected: [[rest], [rest, rest], [event, rest, event]],
    },
    {
      name: "legacy nonzero finite masks",
      input: [[-1, 0.25, 0, -0, 1]],
      expected: [[event, event, rest, rest, event]],
    },
  ])("evaluates $name with existing fixed geometry", ({ input, expected }) => {
    const evaluate = vi.mocked(patterns.evaluatePatternExpression);
    evaluate.mockClear();
    const native = decodeXoxInput(input);
    expect(native.cycle.patterns).toEqual(expected);
    expect(native.condition).toBeUndefined();
    expect(evaluate).toHaveBeenCalledExactlyOnceWith(
      decodeXoxExpression(input),
    );
    expect(timing(native.cycle)).toEqual(
      new Synthesizer().xox(...input).getSchema().eventPattern.timing.cycle,
    );
    expectTypeOf(native.cycle).toExtend<patterns.StaticEventCycle<1>>();
  });

  it("accepts frozen readonly arrays without mutation and returns frozen timing data", () => {
    const input = Object.freeze([Object.freeze([1, 0, 1])]);
    const before = structuredClone(input);
    const native = decodeXoxInput(input);
    expect(input).toEqual(before);
    expect(Object.isFrozen(native)).toBe(true);
    expect(Object.isFrozen(native.cycle)).toBe(true);
    expect(Object.isFrozen(native.cycle.patterns)).toBe(true);
    expect(Object.isFrozen(native.cycle.patterns[0])).toBe(true);
    expect(native.cycle.patterns[0].every(Object.isFrozen)).toBe(true);
    expect(Reflect.set(native.cycle.patterns[0], "0", rest)).toBe(false);
  });

  it.each([null, undefined, NaN, Infinity, -Infinity, true, "1", "xoxo", {}])(
    "rejects invalid numeric masks: %s",
    (value) => {
      expect(() => decodeXoxInput([value])).toThrow(
        "xox() values must be finite numbers",
      );
      expect(() => decodeXoxInput([[value]])).toThrow(
        "xox() values must be finite numbers",
      );
    },
  );

  it("rejects missing bars, simultaneous groups, extra nesting, and mixed random inputs", () => {
    expect(() => decodeXoxInput([])).toThrow(
      "xox() requires at least one pattern",
    );
    expect(() => decodeXoxInput([[[1, 1]]])).toThrow(
      "does not support simultaneous voice groups",
    );
    expect(() => decodeXoxInput([[[]]])).toThrow(
      "does not support simultaneous voice groups",
    );
    expect(() => decodeXoxInput([[[[1]]]])).toThrow(
      "does not support simultaneous voice groups",
    );
    expect(() => decodeXoxInput([new patterns.RandomCycle().bin(), 1])).toThrow(
      "sole argument",
    );
  });
});

describe("random XOX", () => {
  it("bypasses static evaluation and stores fixed candidate geometry plus one independent condition", () => {
    const source = new patterns.RandomCycle()
      .bin()
      .steps(4, 0)
      .euclid(2, 4)
      .slow(2)
      .chance(0.25)
      .ribbon([7, 11], [4, 8])
      .algo("mulberry")
      .reverse();
    const before = structuredClone(source.current);
    const evaluate = vi.mocked(patterns.evaluatePatternExpression);
    evaluate.mockClear();
    const native = decodeXoxInput([source]);
    expect(evaluate).not.toHaveBeenCalled();
    expect(native.cycle.type).toBe("static-event-cycle");
    expect(native.cycle.patterns).toEqual([
      [rest, rest, rest, rest],
      [rest, rest, rest, rest],
      [rest, rest, rest, event],
      [rest, rest, rest, event],
    ]);
    expect(native.condition).toEqual({
      type: "chance",
      probability: 0.25,
      segments: [
        { seed: 7, len: 4 },
        { seed: 11, len: 8 },
      ],
      algorithm: "mulberry",
      order: "reverse",
    });
    expect(source.current).toEqual(before);
    expect(Object.keys(native)).toEqual(["cycle", "condition"]);
    expect(Object.isFrozen(native.condition)).toBe(true);
    expect(Object.isFrozen(native.condition?.segments)).toBe(true);
    expect(native.condition?.segments.every(Object.isFrozen)).toBe(true);
    source.current[3][3] = 0;
    source.chance(0.75).ribbon(99).steps(1);
    expect(native.cycle.patterns[3][3]).toEqual(event);
    expect(native.condition?.probability).toBe(0.25);
    expect(native.condition?.segments).toEqual([
      { seed: 7, len: 4 },
      { seed: 11, len: 8 },
    ]);
  });

  it.each([0, 1])(
    "retains probability %s without prematurely discarding geometry or the condition",
    (probability) => {
      const native = decodeXoxInput([
        new patterns.RandomCycle().bin().steps(2, 0).chance(probability),
      ]);
      expect(native.cycle.patterns).toEqual([[event, event], [rest]]);
      expect(native.condition?.probability).toBe(probability);
    },
  );

  it("retains default chance and does not interpret numeric generation settings as timing", () => {
    const native = decodeXoxInput([
      new patterns.RandomCycle().bin().range(-10, 20).quant(0).steps(3),
    ]);
    expect(native.condition).toEqual({
      type: "chance",
      probability: 0.5,
      segments: [{ seed: 0 }],
      algorithm: "xor",
      order: "forward",
    });
    expect(native.cycle.patterns).toEqual([[event, event, event]]);
    expect(native).not.toHaveProperty("settings");
    expect(native.condition).not.toHaveProperty("range");
    expect(native.condition).not.toHaveProperty("quantValue");
  });

  it("does not introduce a replacement condition for a later fixed XOX input", () => {
    const random = decodeXoxInput([
      new patterns.RandomCycle().bin().chance(0.25),
    ]);
    const fixed = decodeXoxInput([[1, 0]]);
    expect(random.condition?.probability).toBe(0.25);
    expect(fixed.condition).toBeUndefined();
    // State transitions, not the decoder, preserve a previously selected chance
    // condition during fixed rhythm composition (implemented in PR 4).
  });

  it("makes native chance metadata deeply readonly", () => {
    const attemptMutation = (condition: TimingChanceCondition) => {
      // @ts-expect-error Native condition fields are readonly.
      condition.probability = 0;
      // @ts-expect-error Native seed arrays are readonly.
      condition.segments.push({ seed: 1 });
      // @ts-expect-error Native segments are readonly.
      condition.segments[0].seed = 1;
    };
    expectTypeOf(attemptMutation).toBeFunction();
  });

  it.each([
    {
      name: "float source",
      source: () => new patterns.RandomCycle(),
      error: "random masks must be binary",
    },
    {
      name: "integer source",
      source: () => new patterns.RandomCycle().int(),
      error: "random masks must be binary",
    },
    {
      name: "invalid seed",
      source: () => new patterns.RandomCycle().bin().ribbon(NaN),
      error: "seed must be finite",
    },
    {
      name: "invalid length",
      source: () => new patterns.RandomCycle().bin().ribbon(7, 0),
      error: "length must be",
    },
    {
      name: "empty cycle",
      source: () => {
        const source = new patterns.RandomCycle().bin();
        source.clear();
        return source;
      },
      error: "require 1 to 1024 patterns",
    },
    {
      name: "excessive steps",
      source: () =>
        new patterns.RandomCycle()
          .bin()
          .steps(patterns.MAX_EVENT_CYCLE_STEPS + 1),
      error: "16384 steps",
    },
  ])("rejects $name", ({ source, error }) => {
    expect(() => decodeXoxInput([source()])).toThrow(error);
  });

  it("validates malformed candidate values, enum metadata, and probabilities", () => {
    const candidate = new patterns.RandomCycle().bin();
    Reflect.set(candidate.current[0], "0", 2);
    expect(() => decodeXoxInput([candidate])).toThrow(
      "candidate steps must be binary",
    );
    const algorithm = new patterns.RandomCycle().bin();
    Reflect.set(algorithm, "_algorithm", "invalid");
    expect(() => decodeXoxInput([algorithm])).toThrow("algorithm is invalid");
    const probability = new patterns.RandomCycle().bin();
    Reflect.set(probability, "_chance", 2);
    expect(() => decodeXoxInput([probability])).toThrow("chance probability");
  });
});
