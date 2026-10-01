import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  evaluatePatternExpression,
  type AtomInterpreter,
} from "./evaluate-pattern-expression";
import { getEventPatternGeometry } from "./utils/event-grid";
import type {
  PatternExpression,
  PatternNode,
  PatternRange,
} from "./pattern-expression";
import type { StaticEventCycle } from "./event-cycle";
import {
  MAX_EVENT_CYCLE_PATTERNS,
  MAX_EVENT_CYCLE_STEPS,
  MAX_EVENT_GROUP_VOICES,
  MAX_EXPRESSION_DEPTH,
  MAX_EXPRESSION_NODES,
} from "./utils/cycle-limits";
import { createRational } from "./utils/rational";

function atom<T>(value: T, range?: PatternRange) {
  return { type: "atom", value, range } as const;
}
function sequence<T>(...children: PatternNode<T>[]) {
  return { type: "sequence", children } as const;
}
function parallel<T>(...children: PatternNode<T>[]) {
  return { type: "parallel", children } as const;
}
function group<T>(child: PatternNode<T>) {
  return { type: "group", child } as const;
}
function expression<T>(...patterns: PatternNode<T>[]) {
  return {
    type: "pattern-expression",
    patterns,
  } as const satisfies PatternExpression<T>;
}
const rest = { type: "rest" } as const;
const continuation = { type: "continuation" } as const;
const event = <T>(...values: [T, ...T[]]) =>
  ({ type: "event", values }) as const;

function subdivide(depth: number) {
  let node: PatternNode<number> = atom(60);
  for (let index = 0; index < depth; index++) node = sequence(node, rest);
  return node;
}
function nest(depth: number) {
  let node: PatternNode<number> = atom(60);
  for (let index = 1; index < depth; index++) node = group(node);
  return node;
}

describe("evaluatePatternExpression", () => {
  it("interprets typed atoms by identity with accurate inferred types", () => {
    const cycle = evaluatePatternExpression(expression(atom(60)));
    expectTypeOf(cycle).toEqualTypeOf<StaticEventCycle<number>>();
    expect(cycle).toEqual({
      type: "static-event-cycle",
      patterns: [[event(60)]],
    });
  });

  it("keeps method arguments as independent bars, not a sequence or common padded grid", () => {
    const cycle = evaluatePatternExpression(
      expression(
        sequence(atom(60), atom(64)),
        sequence(atom(67), atom(69), atom(72)),
      ),
    );
    expect(cycle.patterns).toEqual([
      [event(60), event(64)],
      [event(67), event(69), event(72)],
    ]);
  });

  it("allocates equal sequential slots and simultaneous values distinctly", () => {
    expect(
      evaluatePatternExpression(
        expression(
          sequence(atom(60), parallel(atom(67), atom(64), atom(64)), rest),
        ),
      ).patterns,
    ).toEqual([[event(60), event(67, 64, 64), rest]]);
  });

  it("preserves grouped parent allocations with the smallest exact grid", () => {
    const cycle = evaluatePatternExpression(
      expression(
        sequence(atom(60), group(sequence(atom(64), atom(67))), atom(72)),
      ),
    );
    expect(cycle.patterns).toEqual([
      [event(60), continuation, event(64), event(67), event(72), continuation],
    ]);
    expect(getEventPatternGeometry(cycle.patterns[0])).toEqual([
      {
        offset: createRational(0),
        duration: createRational(1, 3),
        values: [60],
      },
      {
        offset: createRational(1, 3),
        duration: createRational(1, 6),
        values: [64],
      },
      {
        offset: createRational(1, 2),
        duration: createRational(1, 6),
        values: [67],
      },
      {
        offset: createRational(2, 3),
        duration: createRational(1, 3),
        values: [72],
      },
    ]);
  });

  it("handles multiple levels of unequal nesting without floating-point geometry", () => {
    const cycle = evaluatePatternExpression(
      expression(
        sequence(
          atom(60),
          group(
            sequence(atom(64), group(sequence(atom(65), atom(66), atom(67)))),
          ),
          atom(72),
        ),
      ),
    );
    expect(cycle.patterns[0]).toEqual([
      event(60),
      ...Array.from({ length: 5 }, () => continuation),
      event(64),
      continuation,
      continuation,
      event(65),
      event(66),
      event(67),
      event(72),
      ...Array.from({ length: 5 }, () => continuation),
    ]);
    expect(
      getEventPatternGeometry(cycle.patterns[0]).map(
        ({ duration }) => duration,
      ),
    ).toEqual([
      createRational(1, 3),
      createRational(1, 6),
      createRational(1, 18),
      createRational(1, 18),
      createRational(1, 18),
      createRational(1, 3),
    ]);
  });

  it("distinguishes rests from occupied continuations in nested allocation", () => {
    const cycle = evaluatePatternExpression(
      expression(sequence(atom(60), group(sequence(rest, atom(67))))),
    );
    expect(cycle.patterns).toEqual([
      [event(60), continuation, rest, event(67)],
    ]);
    expect(
      getEventPatternGeometry(cycle.patterns[0]).map(
        ({ duration }) => duration,
      ),
    ).toEqual([createRational(1, 2), createRational(1, 4)]);
  });

  it("retains explicit silent bars and their authored subdivisions", () => {
    expect(
      evaluatePatternExpression(
        expression<number>(rest, sequence(rest, rest, rest), atom(60)),
      ).patterns,
    ).toEqual([[rest], [rest, rest, rest], [event(60)]]);
  });

  it("supports grouped and nested simultaneous voices as one onset", () => {
    const cycle = evaluatePatternExpression(
      expression(
        group(
          parallel(group(atom(60)), parallel(atom(64), atom(64)), atom(67)),
        ),
      ),
    );
    expect(cycle.patterns).toEqual([[event(60, 64, 64, 67)]]);
  });

  it("interprets text leaves in place, passing source ranges and mapping atoms to rests", () => {
    const range = Object.freeze({ start: 4, end: 5 });
    const input = expression(sequence(atom("1", range), atom("0"), atom("1")));
    const snapshot = structuredClone(input);
    const interpret = vi.fn((value: string, sourceRange?: PatternRange) => {
      if (sourceRange) expect(sourceRange).toBe(range);
      return value === "0"
        ? { type: "rest" as const }
        : { type: "event" as const, value: 1 as const };
    });
    const cycle = evaluatePatternExpression(input, interpret);
    expectTypeOf(cycle).toEqualTypeOf<StaticEventCycle<1>>();
    expectTypeOf(interpret).toExtend<AtomInterpreter<string, 1>>();
    expect(cycle.patterns).toEqual([[event(1), rest, event(1)]]);
    expect(interpret.mock.calls).toEqual([
      ["1", range],
      ["0", undefined],
      ["1", undefined],
    ]);
    expect(input).toEqual(snapshot);
  });

  it("does not use null or undefined as an implicit rest sentinel", () => {
    const cycle = evaluatePatternExpression(
      expression(sequence<null | undefined>(atom(null), atom(undefined))),
    );
    expect(cycle.patterns).toEqual([[event(null), event(undefined)]]);
    const interpreted = evaluatePatternExpression(
      expression(atom("null")),
      () => ({ type: "event", value: null }),
    );
    expectTypeOf(interpreted).toEqualTypeOf<StaticEventCycle<null>>();
    expect(interpreted.patterns).toEqual([[event(null)]]);
  });

  it("infers rest-only callbacks without introducing an undefined event payload", () => {
    const cycle = evaluatePatternExpression(expression(atom("0")), () => ({
      type: "rest",
    }));
    expectTypeOf(cycle).toEqualTypeOf<StaticEventCycle<never>>();
    expect(cycle.patterns).toEqual([[rest]]);
  });

  it("evaluates shared nodes per authored occurrence rather than memoizing interpretation", () => {
    const shared = atom("60");
    const interpret = vi.fn((value: string) => ({
      type: "event" as const,
      value: Number(value),
    }));
    expect(
      evaluatePatternExpression(
        expression(shared, sequence(shared, shared)),
        interpret,
      ).patterns,
    ).toEqual([[event(60)], [event(60), event(60)]]);
    expect(interpret).toHaveBeenCalledTimes(3);
  });

  it("freezes newly created structure while leaving frozen input and opaque payloads untouched", () => {
    const payload = { note: 60, type: "sequence", children: [] };
    const leaf = Object.freeze(atom(payload));
    const chord = Object.freeze({
      type: "parallel",
      children: Object.freeze([leaf, leaf]),
    } as const);
    const bar = Object.freeze({
      type: "sequence",
      children: Object.freeze([chord, Object.freeze(rest)]),
    } as const);
    const input = Object.freeze({
      type: "pattern-expression",
      patterns: Object.freeze([bar]),
    } as const);
    const snapshot = structuredClone(input);
    const cycle = evaluatePatternExpression(input);
    expectTypeOf(cycle).toEqualTypeOf<StaticEventCycle<typeof payload>>();
    expect(input).toEqual(snapshot);
    expect(Object.isFrozen(cycle)).toBe(true);
    expect(Object.isFrozen(cycle.patterns)).toBe(true);
    for (const pattern of cycle.patterns) {
      expect(Object.isFrozen(pattern)).toBe(true);
      for (const step of pattern) {
        expect(Object.isFrozen(step)).toBe(true);
        if (step.type === "event") {
          expect(Object.isFrozen(step.values)).toBe(true);
          expect(step.values[0]).toBe(payload);
        }
        expect(Object.keys(step)).not.toContain("offset");
        expect(Object.keys(step)).not.toContain("duration");
      }
    }
    expect(Object.isFrozen(payload)).toBe(false);
    expect(Reflect.set(cycle.patterns[0], "0", rest)).toBe(false);
    expect(Reflect.set(cycle, "type", "other")).toBe(false);
  });

  it("propagates consumer interpretation errors unchanged without altering input", () => {
    const input = expression(sequence(atom("60"), atom("bad")));
    const before = structuredClone(input);
    const error = new Error("[notes] Invalid atom at source range");
    const interpret = (value: string) => {
      if (value === "bad") throw error;
      return { type: "event" as const, value: Number(value) };
    };
    expect(() => evaluatePatternExpression(input, interpret)).toThrow(error);
    expect(input).toEqual(before);
  });
});

describe("evaluation validation and limits", () => {
  it("rejects unsupported runtime node tags rather than silently skipping them", () => {
    const node = atom(60);
    Reflect.set(node, "type", "unknown");
    expect(() => evaluatePatternExpression(expression(node))).toThrow(
      "Unsupported expression node",
    );
  });

  it("rejects empty expressions, sequences, and simultaneous groups", () => {
    expect(() => evaluatePatternExpression(expression<number>())).toThrow(
      "at least one pattern",
    );
    expect(() =>
      evaluatePatternExpression(expression(sequence<number>())),
    ).toThrow("Sequences cannot be empty");
    expect(() =>
      evaluatePatternExpression(expression(parallel<number>())),
    ).toThrow("voice groups cannot be empty");
  });

  it("rejects explicit and interpreted rests in simultaneous groups", () => {
    expect(() =>
      evaluatePatternExpression(expression(parallel(atom(60), rest))),
    ).toThrow("Rests cannot be simultaneous voices");
    expect(() =>
      evaluatePatternExpression(
        expression(parallel(atom("1"), atom("0"))),
        (value) =>
          value === "0" ? { type: "rest" } : { type: "event", value: 1 },
      ),
    ).toThrow("Rests cannot be simultaneous voices");
  });

  it("rejects sequential structures inside simultaneous groups rather than flattening timing", () => {
    expect(() =>
      evaluatePatternExpression(
        expression(parallel(sequence(atom(60), atom(64)), atom(67))),
      ),
    ).toThrow("not sequential or time-varying structures");
  });

  it("reports available source ranges for structural errors", () => {
    const input = expression({
      type: "sequence",
      children: [],
      range: { start: 2, end: 4 },
    });
    expect(() => evaluatePatternExpression(input)).toThrow(
      "source range [2, 4)",
    );
  });

  it.each(["repeat", "accelerate", "slow", "weight"] as const)(
    "rejects deferred %s modifiers explicitly",
    (operator) => {
      expect(() =>
        evaluatePatternExpression(
          expression({
            type: "modifier",
            operator,
            amount: "2",
            child: atom(60),
          }),
        ),
      ).toThrow("Modifier evaluation is not supported yet");
    },
  );

  it("rejects deferred alternation explicitly", () => {
    expect(() =>
      evaluatePatternExpression(
        expression({ type: "alternate", children: [atom(60), atom(64)] }),
      ),
    ).toThrow("Alternation evaluation is not supported yet");
  });

  it("accepts exactly the pattern limit and rejects additional bars", () => {
    const patterns = Array.from({ length: MAX_EVENT_CYCLE_PATTERNS }, () =>
      atom(60),
    );
    expect(
      evaluatePatternExpression(expression(...patterns)).patterns,
    ).toHaveLength(MAX_EVENT_CYCLE_PATTERNS);
    const interpret = vi.fn((value: number) => ({
      type: "event" as const,
      value,
    }));
    expect(() =>
      evaluatePatternExpression(expression(...patterns, atom(60)), interpret),
    ).toThrow("more than 1024 patterns");
    expect(interpret).not.toHaveBeenCalled();
  });

  it("accepts exactly the simultaneous voice limit and rejects excessive voices", () => {
    const voices = Array.from({ length: MAX_EVENT_GROUP_VOICES }, () =>
      atom(60),
    );
    expect(
      evaluatePatternExpression(expression(parallel(...voices))).patterns[0],
    ).toEqual([event(60, ...Array<number>(127).fill(60))]);
    expect(() =>
      evaluatePatternExpression(expression(parallel(...voices, atom(67)))),
    ).toThrow("more than 128 voices");
  });

  it("bounds denominators and normalized expansion even with very small trees", () => {
    const accepted = evaluatePatternExpression(expression(subdivide(14)));
    expect(accepted.patterns[0]).toHaveLength(MAX_EVENT_CYCLE_STEPS);
    expect(getEventPatternGeometry(accepted.patterns[0])[0].duration).toEqual(
      createRational(1, MAX_EVENT_CYCLE_STEPS),
    );
    expect(() => evaluatePatternExpression(expression(subdivide(15)))).toThrow(
      "Rational denominator exceeds",
    );
    expect(() =>
      evaluatePatternExpression(expression(subdivide(14), atom(67))),
    ).toThrow("more than 16384 steps");
  });

  it("rejects excessive common grids even when individual rational denominators fit", () => {
    const input = expression(
      sequence(
        group(sequence(...Array.from({ length: 129 }, () => atom(60)))),
        group(sequence(...Array.from({ length: 128 }, () => atom(64)))),
        atom(67),
      ),
    );
    const before = structuredClone(input);
    expect(() => evaluatePatternExpression(input)).toThrow("Grid exceeds");
    expect(input).toEqual(before);
  });

  it("enforces the total step budget across independently normalized bars", () => {
    const first = sequence(
      group(sequence(...Array.from({ length: 127 }, () => atom(60)))),
      ...Array.from({ length: 127 }, () => atom(64)),
    );
    const last = sequence(...Array.from({ length: 128 }, () => atom(67)));
    const accepted = evaluatePatternExpression(expression(first, last));
    expect(accepted.patterns.map((pattern) => pattern.length)).toEqual([
      16256, 128,
    ]);
    expect(() =>
      evaluatePatternExpression(
        expression(first, sequence(...last.children, atom(69))),
      ),
    ).toThrow("128 steps");
  });

  it("checks expression node limits before calling the interpreter", () => {
    const children = Array.from({ length: MAX_EXPRESSION_NODES - 1 }, () =>
      atom(60),
    );
    expect(
      evaluatePatternExpression(expression(sequence(...children))).patterns[0],
    ).toHaveLength(MAX_EXPRESSION_NODES - 1);
    const interpret = vi.fn((value: number) => ({
      type: "event" as const,
      value,
    }));
    expect(() =>
      evaluatePatternExpression(
        expression(sequence(...children, atom(60))),
        interpret,
      ),
    ).toThrow("more than 16384 nodes");
    expect(interpret).not.toHaveBeenCalled();
  });

  it("checks depth and cycles before recursion can overflow", () => {
    expect(
      evaluatePatternExpression(expression(nest(MAX_EXPRESSION_DEPTH)))
        .patterns,
    ).toEqual([[event(60)]]);
    expect(() => evaluatePatternExpression(expression(nest(10000)))).toThrow(
      "maximum depth",
    );
    const children: PatternNode<number>[] = [];
    const node = { type: "sequence", children } as const;
    children.push(node);
    expect(() => evaluatePatternExpression(expression(node))).toThrow(
      "maximum depth",
    );
  });

  it("agrees with integer subdivision geometry over varied outer/inner allocations", () => {
    for (let outer = 2; outer <= 7; outer++) {
      for (let inner = 2; inner <= 7; inner++) {
        const input = expression(
          sequence(
            group(
              sequence(
                ...Array.from({ length: inner }, (_, index) => atom(index)),
              ),
            ),
            ...Array.from({ length: outer - 1 }, (_, index) =>
              atom(inner + index),
            ),
          ),
        );
        const pattern = evaluatePatternExpression(input).patterns[0];
        expect(pattern).toHaveLength(outer * inner);
        const geometry = getEventPatternGeometry(pattern);
        expect(geometry.slice(0, inner).map(({ offset }) => offset)).toEqual(
          Array.from({ length: inner }, (_, index) =>
            createRational(index, outer * inner),
          ),
        );
        expect(
          geometry
            .slice(inner)
            .map(({ offset, duration }) => [offset, duration]),
        ).toEqual(
          Array.from({ length: outer - 1 }, (_, index) => [
            createRational(index + 1, outer),
            createRational(1, outer),
          ]),
        );
      }
    }
  });
});
