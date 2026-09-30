import * as patterns from "@web-audio/patterns";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import Synthesizer from "@/instruments/synthesizer";
import Sampler from "@/instruments/sampler";
import {
  MAX_STRUCTURED_INPUT_ITEMS,
  decodeNotesExpression,
  decodeNotesInput,
  decodeSampleNamesExpression,
  decodeSampleNamesInput,
  decodeStructuredInput,
  decodeVariationsExpression,
  decodeVariationsInput,
} from "./decode-structured-input";

vi.mock("@web-audio/patterns", { spy: true });

const atom = <T>(value: T) => ({ type: "atom", value }) as const;
const event = <T>(...values: [T, ...T[]]) =>
  ({ type: "event", values }) as const;
const rest = { type: "rest" } as const;
const expression = <T>(...nodes: patterns.PatternNode<T>[]) =>
  ({ type: "pattern-expression", patterns: nodes }) as const;

function requireStatic<T>(
  cycle: patterns.StaticEventCycle<T> | patterns.RandomEventCycle,
) {
  if (cycle.type !== "static-event-cycle")
    throw new Error("Expected static cycle");
  return cycle;
}

function timing<T>(cycle: patterns.StaticEventCycle<T>) {
  return cycle.patterns.map((bar) =>
    patterns.getEventPatternGeometry(bar).map(({ offset, duration }) => ({
      offset: offset.numerator / offset.denominator,
      duration: duration.numerator / duration.denominator,
    })),
  );
}

describe("structured expression decoding", () => {
  it("makes method arguments explicit bars rather than sequential slots", () => {
    expect(decodeNotesExpression([60, 64])).toEqual(
      expression(atom(60), atom(64)),
    );
    expect(decodeNotesExpression([[60, 64]])).toEqual(
      expression({ type: "sequence", children: [atom(60), atom(64)] }),
    );
    expectTypeOf(decodeNotesExpression([60])).toExtend<
      patterns.PatternExpression<number>
    >();
    expectTypeOf(decodeSampleNamesExpression(["bd"])).toExtend<
      patterns.PatternExpression<string>
    >();
    expectTypeOf(decodeVariationsExpression([0])).toExtend<
      patterns.PatternExpression<number>
    >();
  });

  it("makes nested arrays simultaneous groups with ordered duplicate voices", () => {
    expect(decodeNotesExpression([[60, [67, 64, 64], null]])).toEqual(
      expression({
        type: "sequence",
        children: [
          atom(60),
          { type: "parallel", children: [atom(67), atom(64), atom(64)] },
          rest,
        ],
      }),
    );
    expect(decodeSampleNamesExpression([[[" bd ", "hh", "bd"], "sd"]])).toEqual(
      expression({
        type: "sequence",
        children: [
          { type: "parallel", children: [atom("bd"), atom("hh"), atom("bd")] },
          atom("sd"),
        ],
      }),
    );
    expect(decodeVariationsExpression([[[0, 1], null, [2, 3]]])).toEqual(
      expression({
        type: "sequence",
        children: [
          { type: "parallel", children: [atom(0), atom(1)] },
          rest,
          { type: "parallel", children: [atom(2), atom(3)] },
        ],
      }),
    );
  });

  it("maps allowed whole-step rests and empty bars to inspectable rest nodes", () => {
    expect(
      decodeNotesExpression([undefined, null, [], [60, undefined, null]]),
    ).toEqual(
      expression(rest, rest, rest, {
        type: "sequence",
        children: [atom(60), rest, rest],
      }),
    );
    expect(decodeSampleNamesExpression([null, [], ["bd", null]])).toEqual(
      expression(rest, rest, {
        type: "sequence",
        children: [atom("bd"), rest],
      }),
    );
    expect(decodeVariationsExpression([null, []])).toEqual(
      expression(rest, rest),
    );
  });

  it("preserves legacy nullable note chord placeholders without creating rest voices", () => {
    const input = [
      [[60, null, undefined, 60], [null, undefined], [67]],
    ] as const;
    const native = requireStatic(decodeNotesInput(input));
    expect(native.patterns).toEqual([[event(60, 60), rest, event(67)]]);
    expect(decodeNotesExpression(input)).toEqual(
      expression({
        type: "sequence",
        children: [
          { type: "parallel", children: [atom(60), atom(60)] },
          rest,
          { type: "parallel", children: [atom(67)] },
        ],
      }),
    );
    const legacy = new Synthesizer()
      .notes([[60, null, undefined, 60], [null, undefined], [67]])
      .getSchema().eventPattern;
    expect(timing(native)).toEqual(legacy.timing.cycle);
    expect(legacy.notes).toEqual({ type: "static", cycle: [[[60, 60], [67]]] });
  });

  it("treats sparse note slots and voice placeholders like undefined", () => {
    const bar = Array<number | undefined>(3);
    bar[0] = 60;
    bar[2] = 67;
    expect(requireStatic(decodeNotesInput([bar])).patterns).toEqual([
      [event(60), rest, event(67)],
    ]);
    expect(requireStatic(decodeNotesInput([[bar]])).patterns).toEqual([
      [event(60, 67)],
    ]);
    expect(() => decodeVariationsExpression([bar])).toThrow("finite numbers");
  });

  it("copies and freezes expression structure while leaving caller arrays untouched", () => {
    const chord = [60, 64];
    const bar = [chord, null, 67];
    const input = [bar];
    const before = structuredClone(input);
    const decoded = decodeNotesExpression(input);
    expect(input).toEqual(before);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(chord)).toBe(false);
    expect(Object.keys(decoded)).toEqual(["type", "patterns"]);
    expect(Object.isFrozen(decoded)).toBe(true);
    expect(Object.isFrozen(decoded.patterns)).toBe(true);
    const node = decoded.patterns[0];
    if (node.type !== "sequence") throw new Error("Expected sequence");
    expect(Object.isFrozen(node)).toBe(true);
    expect(Object.isFrozen(node.children)).toBe(true);
    const group = node.children[0];
    if (group.type !== "parallel") throw new Error("Expected parallel");
    expect(Object.isFrozen(group.children)).toBe(true);
    expect(group.children.every(Object.isFrozen)).toBe(true);
    chord.push(72);
    bar.push(69);
    expect(group.children).toEqual([atom(60), atom(64)]);
    expect(node.children).toHaveLength(3);
    expect(Reflect.set(decoded.patterns, "0", rest)).toBe(false);
  });

  it("rejects extra nesting independently of the consumer's atom interpreter", () => {
    const interpretValue = vi.fn(
      (value: unknown) => ({ type: "event", value }) as const,
    );
    expect(() =>
      decodeStructuredInput([[[[60]]]], { method: "[test]", interpretValue }),
    ).toThrow("extra array nesting");
    expect(interpretValue).not.toHaveBeenCalled();
  });

  it("supports readonly frozen input and generic typed atom payloads", () => {
    const input = Object.freeze([
      Object.freeze([Object.freeze([60, 64]), null, 67]),
    ]);
    expect(requireStatic(decodeNotesInput(input)).patterns).toEqual([
      [event(60, 64), rest, event(67)],
    ]);
    const payload = { note: 60 };
    const decoded = decodeStructuredInput([payload], {
      method: "[test]",
      interpretValue: (value) => {
        if (value !== payload) throw new Error("Unexpected value");
        return { type: "event", value: payload };
      },
    });
    expect(patterns.evaluatePatternExpression(decoded).patterns).toEqual([
      [event(payload)],
    ]);
    expect(Object.isFrozen(payload)).toBe(false);
  });
});

describe("static consumer evaluation", () => {
  it.each([
    { name: "scalar", input: [60], expected: [[event(60)]] },
    { name: "one-element array", input: [[60]], expected: [[event(60)]] },
    {
      name: "multiple bars",
      input: [60, 64],
      expected: [[event(60)], [event(64)]],
    },
    {
      name: "sequence and rest",
      input: [[60, null, 64]],
      expected: [[event(60), rest, event(64)]],
    },
    {
      name: "chords",
      input: [
        [
          [60, 60],
          [64, 67],
        ],
      ],
      expected: [[event(60, 60), event(64, 67)]],
    },
    { name: "silent bar", input: [[], [67]], expected: [[rest], [event(67)]] },
    {
      name: "negative and fractional",
      input: [[-1.5, 2.25]],
      expected: [[event(-1.5), event(2.25)]],
    },
  ])(
    "evaluates $name through the shared evaluator with corrected note geometry",
    ({ input, expected }) => {
      const evaluate = vi.mocked(patterns.evaluatePatternExpression);
      evaluate.mockClear();
      const native = requireStatic(decodeNotesInput(input));
      expect(native.patterns).toEqual(expected);
      expect(evaluate).toHaveBeenCalledExactlyOnceWith(
        decodeNotesExpression(input),
      );
      expect(timing(native)).toEqual(
        new Synthesizer().notes(...input).getSchema().eventPattern.timing.cycle,
      );
    },
  );

  it("evaluates names and variations with independent equal-width geometry", () => {
    const names = decodeSampleNamesInput([
      ["bd", null, "sd"],
      [],
      [["hh", "hh"]],
    ]);
    const variations = requireStatic(
      decodeVariationsInput([[[0, 1], null, [2, 3]], []]),
    );
    expect(names.patterns).toEqual([
      [event("bd"), rest, event("sd")],
      [rest],
      [event("hh", "hh")],
    ]);
    expect(variations.patterns).toEqual([
      [event(0, 1), rest, event(2, 3)],
      [rest],
    ]);
    expect(timing(names)).toEqual(
      new Sampler(undefined)
        .name(["bd", null, "sd"], [], [["hh", "hh"]])
        .getSchema().eventPattern.timing.cycle,
    );
    expect(timing(variations)).toEqual(
      new Sampler("bd").variation([[0, 1], null, [2, 3]], []).getSchema()
        .eventPattern.timing.cycle,
    );
    expectTypeOf(names).toEqualTypeOf<patterns.StaticEventCycle<string>>();
  });

  it("retains current sample-name validation until the Step 7.3 alias cutover", () => {
    expect(
      decodeSampleNamesInput([" bd:2 ", "kick-drum", "two words"]).patterns,
    ).toEqual([[event("bd:2")], [event("kick-drum")], [event("two words")]]);
  });
});

describe("consumer validation and bounds", () => {
  it("records legacy empty-note-chord acceptance for review before production cutover", () => {
    expect(new Synthesizer().notes([[]]).getSchema().eventPattern).toEqual({
      timing: { cycle: [[]] },
      notes: { type: "static", cycle: [[null]] },
    });
    expect(() => decodeNotesInput([[[]]])).toThrow(
      "voice groups cannot be empty",
    );
  });

  it("records empty-note-bar timing priority as a native transition feasibility case", () => {
    const legacy = new Sampler("bd")
      .notes([], [60])
      .variation([0, 1])
      .getSchema().eventPattern;
    expect(legacy.timing.cycle).toEqual([
      [],
      [
        { offset: 0, duration: 0.5 },
        { offset: 0.5, duration: 0.5 },
      ],
    ]);
    expect(requireStatic(decodeNotesInput([[], [60]])).patterns).toEqual([
      [rest],
      [event(60)],
    ]);
    // Canonical silence is specified, but treating this as an authored-rest
    // priority/filter would lose the legacy empty-bar distinction. PR 4 must
    // resolve its provenance or explicitly review the behavior before cutover.
  });

  it.each([
    { method: "notes()", decode: decodeNotesInput },
    { method: "name()", decode: decodeSampleNamesInput },
    { method: "variation()", decode: decodeVariationsInput },
  ])(
    "rejects missing bars, empty voice groups, and extra nesting in $method",
    ({ method, decode }) => {
      expect(() => decode([])).toThrow(
        `${method} requires at least one pattern`,
      );
      expect(() => decode([[[]]])).toThrow(
        "simultaneous voice groups cannot be empty",
      );
      expect(() => decode([[[[60]]]])).toThrow(method);
    },
  );

  it.each([NaN, Infinity, -Infinity, "60", true, {}, () => 60])(
    "rejects nonfinite or nonnumeric note/variation values: %s",
    (value) => {
      for (const decode of [decodeNotesInput, decodeVariationsInput]) {
        expect(() => decode([value])).toThrow("finite numbers");
        expect(() => decode([[[value]]])).toThrow("finite numbers");
      }
    },
  );

  it.each(["", "  ", 60, {}, true, undefined])(
    "rejects invalid names without relying on trim() type errors: %s",
    (value) => {
      expect(() => decodeSampleNamesInput([value])).toThrow(
        "name() sample names must be non-empty strings",
      );
    },
  );

  it("permits only existing whole-hit rest forms for names and variations", () => {
    for (const decode of [decodeSampleNamesInput, decodeVariationsInput]) {
      expect(() => decode([undefined])).toThrow();
      expect(() => decode([[[null]]])).toThrow("whole-hit rest");
      expect(() => decode([[[undefined]]])).toThrow("whole-hit rest");
    }
  });

  it("rejects mixed and embedded random inputs, and all random names", () => {
    const source = new patterns.RandomCycle();
    for (const decode of [decodeNotesInput, decodeVariationsInput]) {
      expect(() => decode([source, 60])).toThrow("sole argument");
      expect(() => decode([[source]])).toThrow("finite numbers");
    }
    expect(() => decodeNotesExpression([source])).toThrow(
      "bypass structured decoding",
    );
    expect(() => decodeSampleNamesInput([source])).toThrow(
      "does not support random patterns",
    );
  });

  it("checks pattern, voice, and expression bounds before unbounded allocation", () => {
    const bars = Array<number>(patterns.MAX_EVENT_CYCLE_PATTERNS).fill(60);
    expect(decodeNotesExpression(bars).patterns).toHaveLength(
      patterns.MAX_EVENT_CYCLE_PATTERNS,
    );
    expect(() => decodeNotesExpression([...bars, 60])).toThrow("1024 patterns");
    const voices = Array<number>(patterns.MAX_EVENT_GROUP_VOICES).fill(60);
    expect(requireStatic(decodeNotesInput([[voices]])).patterns[0]).toEqual([
      event(60, ...voices.slice(1)),
    ]);
    expect(() => decodeNotesExpression([[[...voices, 60]]])).toThrow(
      "128 voices",
    );
    const slots = Array<number>(patterns.MAX_EXPRESSION_NODES - 1).fill(60);
    expect(decodeNotesExpression([slots]).patterns).toHaveLength(1);
    expect(() => decodeNotesExpression([[...slots, 60]])).toThrow(
      "16384 nodes",
    );
    // A further one-voice group adds both a wrapper and an atom.
    const grouped = [
      Array<number>(128).fill(60),
      ...Array<number>(patterns.MAX_EXPRESSION_NODES - 130).fill(60),
    ];
    expect(decodeNotesExpression([grouped]).patterns).toHaveLength(1);
    expect(() => decodeNotesExpression([[...grouped, [60]]])).toThrow(
      "16384 nodes",
    );
  });
});

describe("raw structured traversal budget", () => {
  const budgetError = `structured input contains more than ${MAX_STRUCTURED_INPUT_ITEMS} raw items`;

  it.each([100_000, 1_000_000_000])(
    "rejects a %s-slot sparse nullable chord before reading any voice",
    (length) => {
      const chord = Array<undefined>(length);
      const readVoice = vi.fn(() => undefined);
      Object.defineProperty(chord, "0", { get: readVoice });
      expect(() => decodeNotesInput([[chord]])).toThrow(
        `[Instrument] notes() ${budgetError}`,
      );
      expect(readVoice).not.toHaveBeenCalled();
    },
  );

  it.each(["sparse", "null", "undefined"] as const)(
    "counts omitted %s placeholders at the exact raw boundary",
    (kind) => {
      // One argument and one bar slot leave this many raw chord slots.
      const chord = Array<number | null | undefined>(
        MAX_STRUCTURED_INPUT_ITEMS - 2,
      );
      if (kind === "null") chord.fill(null);
      if (kind === "undefined") chord.fill(undefined);
      expect(requireStatic(decodeNotesInput([[chord]])).patterns).toEqual([
        [rest],
      ]);
      chord.length++;
      expect(() => decodeNotesInput([[chord]])).toThrow(budgetError);
    },
  );

  it("keeps surviving voices separate from raw nullable slots", () => {
    const chord = Array<number | undefined>(MAX_STRUCTURED_INPUT_ITEMS - 2);
    chord[chord.length - 1] = 60;
    expect(requireStatic(decodeNotesInput([[chord]])).patterns).toEqual([
      [event(60)],
    ]);
    expect(() =>
      decodeNotesInput([
        [Array<number>(patterns.MAX_EVENT_GROUP_VOICES + 1).fill(60)],
      ]),
    ).toThrow("128 voices");
  });

  it("accumulates raw work across bars and rejects a later group before scanning it", () => {
    const first = Array<undefined>(MAX_STRUCTURED_INPUT_ITEMS / 2);
    const second = Array<undefined>(MAX_STRUCTURED_INPUT_ITEMS / 2);
    const readVoice = vi.fn(() => undefined);
    Object.defineProperty(second, "0", { get: readVoice });
    expect(requireStatic(decodeNotesInput([[first]])).patterns).toEqual([
      [rest],
    ]);
    expect(() => decodeNotesInput([[first], [second]])).toThrow(budgetError);
    expect(readVoice).not.toHaveBeenCalled();
  });

  it("accumulates raw work across groups within a bar", () => {
    const chord = Array<undefined>(MAX_STRUCTURED_INPUT_ITEMS / 4);
    expect(() => decodeNotesInput([[chord, chord, chord, chord]])).toThrow(
      budgetError,
    );
  });

  it("guards oversized sample-name argument arrays before random detection", () => {
    const input = Array<unknown>(1_000_000_000);
    const readArgument = vi.fn(() => "bd");
    Object.defineProperty(input, "0", { get: readArgument });
    expect(() => decodeSampleNamesInput(input)).toThrow("1024 patterns");
    expect(readArgument).not.toHaveBeenCalled();
  });

  it("does not traverse opaque atom payload contents", () => {
    const payload = { data: Array<undefined>(1_000_000_000) };
    const decoded = decodeStructuredInput([payload], {
      method: "[test]",
      interpretValue: () => ({ type: "event", value: payload }),
    });
    expect(decoded.patterns).toEqual([atom(payload)]);
    expect(Object.isFrozen(payload)).toBe(false);
  });
});

describe("random numeric input", () => {
  it.each([decodeNotesInput, decodeVariationsInput])(
    "bypasses expression evaluation and snapshots numeric settings",
    (decode) => {
      const source = new patterns.RandomCycle()
        .int()
        .steps(4)
        .euclid(2, 4)
        .slow(2)
        .range(-2, 8)
        .quant(0.25)
        .ribbon([7, 11], [4, 8])
        .algo("mulberry")
        .reverse();
      const schema = source.getRandomSchema();
      const before = structuredClone(source.current);
      const evaluate = vi.mocked(patterns.evaluatePatternExpression);
      evaluate.mockClear();
      const native = decode([source]);
      expect(evaluate).not.toHaveBeenCalled();
      expect(native.type).toBe("random-event-cycle");
      if (native.type !== "random-event-cycle")
        throw new Error("Expected random cycle");
      expect(native.candidateCycle.patterns).toEqual([
        [rest, rest, rest, event(1)],
        [rest, rest, rest, event(1)],
      ]);
      expect(native.settings).toEqual({
        dataType: "integer",
        segments: [
          { seed: 7, len: 4 },
          { seed: 11, len: 8 },
        ],
        range: { min: -2, max: 8 },
        quantValue: 0.25,
        algorithm: "mulberry",
        order: "reverse",
        valueMap: undefined,
      });
      expect(source.getRandomSchema()).toEqual(schema);
      expect(source.current).toEqual(before);
      expect(Object.isFrozen(native)).toBe(true);
      expect(Object.isFrozen(native.settings)).toBe(true);
      expect(Object.isFrozen(native.settings.range)).toBe(true);
      expect(Object.isFrozen(native.settings.segments)).toBe(true);
      expect(native.settings.segments.every(Object.isFrozen)).toBe(true);
      expect(Object.isFrozen(native.candidateCycle.patterns[0])).toBe(true);
      source.current[0][3] = 0;
      source.range(0, 1).ribbon(99).steps(1);
      expect(native.candidateCycle.patterns[0][3]).toEqual(event(1));
      expect(native.settings.range).toEqual({ min: -2, max: 8 });
      expect(native.settings.segments).toEqual([
        { seed: 7, len: 4 },
        { seed: 11, len: 8 },
      ]);
    },
  );

  it("retains zero-count bars as explicit silence and materializes authored speed chains", () => {
    const source = new patterns.RandomCycle().steps(2, 0).fast(2).slow(2);
    const native = decodeNotesInput([source]);
    if (native.type !== "random-event-cycle")
      throw new Error("Expected random cycle");
    expect(native.candidateCycle.patterns).toEqual([
      [event(1), event(1)],
      [rest],
    ]);
    expect(Object.keys(native)).toEqual(["type", "candidateCycle", "settings"]);
  });

  it("retains silence created by applying rhythm to zero-count random bars", () => {
    const source = new patterns.RandomCycle()
      .steps(4, 0)
      .euclid(2, 4)
      .slow(2)
      .reverse();
    const native = decodeVariationsInput([source]);
    if (native.type !== "random-event-cycle")
      throw new Error("Expected random cycle");
    expect(native.candidateCycle.patterns).toEqual([
      [rest, rest, rest, rest],
      [rest, rest, rest, rest],
      [rest, rest, rest, event(1)],
      [rest, rest, rest, event(1)],
    ]);
  });

  it("retains optional value maps from compatible random primitives without aliasing", () => {
    const valueMap = [7, 11];
    class MappedRandomCycle extends patterns.RandomCycle {
      override getRandomSchema() {
        return { ...super.getRandomSchema(), valueMap };
      }
    }
    const source = new MappedRandomCycle().bin();
    const native = decodeVariationsInput([source]);
    if (native.type !== "random-event-cycle")
      throw new Error("Expected random cycle");
    expect(native.settings.valueMap).toEqual([7, 11]);
    expect(Object.isFrozen(native.settings.valueMap)).toBe(true);
    valueMap[0] = 99;
    expect(native.settings.valueMap).toEqual([7, 11]);
  });

  it.each([
    {
      name: "numeric timing chance",
      source: () => new patterns.RandomCycle().bin().chance(0.25),
      error: "cannot be serialized as a numeric value pattern",
    },
    {
      name: "nonfinite range",
      source: () => new patterns.RandomCycle().range(0, Infinity),
      error: "range endpoints",
    },
    {
      name: "invalid quantization",
      source: () => new patterns.RandomCycle().quant(0),
      error: "quantValue",
    },
    {
      name: "invalid seed",
      source: () => new patterns.RandomCycle().ribbon(NaN),
      error: "seed must be finite",
    },
    {
      name: "invalid ribbon length",
      source: () => new patterns.RandomCycle().ribbon(7, 0),
      error: "length must be",
    },
    {
      name: "empty cycle",
      source: () => {
        const source = new patterns.RandomCycle();
        source.clear();
        return source;
      },
      error: "require 1 to 1024 patterns",
    },
    {
      name: "excessive steps",
      source: () =>
        new patterns.RandomCycle().steps(patterns.MAX_EVENT_CYCLE_STEPS + 1),
      error: "16384 steps",
    },
  ])("rejects $name", ({ source, error }) => {
    expect(() => decodeNotesInput([source()])).toThrow(error);
  });
});
