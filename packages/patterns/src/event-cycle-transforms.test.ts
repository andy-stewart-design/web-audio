import { describe, expect, expectTypeOf, it } from "vitest";
import {
  assertEventCycleInvariants,
  type EventCycle,
  type EventPattern,
  type EventStep,
  type RandomEventCycle,
  type StaticEventCycle,
} from "./event-cycle";
import {
  fastEventCycle,
  reverseEventCycle,
  slowEventCycle,
  stretchEventCycle,
} from "./event-cycle-transforms";
import { getEventPatternGeometry } from "./utils/event-grid";
import { createRational } from "./utils/rational";
import {
  MAX_EVENT_CYCLE_PATTERNS,
  MAX_EVENT_CYCLE_STEPS,
  MAX_EVENT_CYCLE_VOICES,
} from "./utils/cycle-limits";
import Speed from "./utils/speed";
import { reverse } from "./utils/reverse";
import { stretch } from "./utils/stretch";

const rest = { type: "rest" } as const;
const continuation = { type: "continuation" } as const;
const event = <T>(...values: [T, ...T[]]) =>
  ({ type: "event", values }) as const;
const cycle = <T>(...patterns: EventPattern<T>[]) =>
  ({ type: "static-event-cycle", patterns }) as const;
const mask = (...patterns: number[][]) =>
  cycle(
    ...patterns.map((pattern) =>
      pattern.map((value) => (value === 0 ? rest : event(value))),
    ),
  );
const numbers = (input: StaticEventCycle<number>) =>
  input.patterns.map((pattern) =>
    pattern.map((step) => {
      if (step.type === "continuation")
        throw new Error("Expected unweighted pattern");
      return step.type === "rest" ? 0 : step.values[0];
    }),
  );
const geometry = <T>(input: StaticEventCycle<T>) =>
  input.patterns.map((pattern) =>
    getEventPatternGeometry(pattern).map(({ offset, duration, values }) => ({
      offset,
      duration,
      values,
    })),
  );
const rational = (numerator: number, denominator = 1) => ({
  numerator,
  denominator,
});

function expectFrozen<T>(input: StaticEventCycle<T>) {
  assertEventCycleInvariants(input);
  expect(Object.isFrozen(input)).toBe(true);
  expect(Object.isFrozen(input.patterns)).toBe(true);
  for (const pattern of input.patterns) {
    expect(Object.isFrozen(pattern)).toBe(true);
    for (const step of pattern) {
      expect(Object.isFrozen(step)).toBe(true);
      if (step.type === "event")
        expect(Object.isFrozen(step.values)).toBe(true);
    }
  }
}

const random = (candidateCycle: StaticEventCycle<1>) =>
  ({
    type: "random-event-cycle",
    candidateCycle,
    settings: {
      dataType: "integer",
      segments: [
        { seed: 7, len: 4 },
        { seed: 11, len: 8 },
      ],
      algorithm: "mulberry",
      order: "forward",
      range: { min: -2, max: 8 },
      quantValue: 0.25,
      valueMap: [7, 11],
    },
  }) as const satisfies RandomEventCycle;

const transforms = [
  {
    name: "reverse",
    apply: <T>(input: StaticEventCycle<T>) => reverseEventCycle(input),
  },
  {
    name: "fast",
    apply: <T>(input: StaticEventCycle<T>) => fastEventCycle(input, 2),
  },
  {
    name: "slow",
    apply: <T>(input: StaticEventCycle<T>) => slowEventCycle(input, 2),
  },
  {
    name: "stretch",
    apply: <T>(input: StaticEventCycle<T>) => stretchEventCycle(input, 2, 2),
  },
];

describe("reverseEventCycle", () => {
  it("reverses bars and event/rest blocks without reversing voices or detaching gates", () => {
    const source = cycle(
      [event(60, 64, 64), continuation, continuation, rest, event(67)],
      [rest, event(72), continuation],
    );
    const result = reverseEventCycle(source);
    expect(result.patterns).toEqual([
      [event(72), continuation, rest],
      [event(67), rest, event(60, 64, 64), continuation, continuation],
    ]);
    expect(geometry(result)).toEqual([
      [{ offset: rational(0), duration: rational(2, 3), values: [72] }],
      [
        { offset: rational(0), duration: rational(1, 5), values: [67] },
        {
          offset: rational(2, 5),
          duration: rational(3, 5),
          values: [60, 64, 64],
        },
      ],
    ]);
    expect(reverseEventCycle(result)).toEqual(source);
  });

  it("retains silent bars and every explicit rest subdivision", () => {
    expect(
      reverseEventCycle(cycle([rest, rest], [event(1), rest], [rest])).patterns,
    ).toEqual([[rest], [rest, event(1)], [rest, rest]]);
  });
});

describe("fastEventCycle", () => {
  it.each([
    { name: "one bar", input: [[1, 2]], rate: 2, expected: [[1, 2, 1, 2]] },
    {
      name: "complete multi-bar phrase",
      input: [[1], [2], [3], [4]],
      rate: 2,
      expected: [
        [1, 2],
        [3, 4],
      ],
    },
    {
      name: "non-dividing phrase",
      input: [[1], [2], [3]],
      rate: 2,
      expected: [
        [1, 2],
        [3, 1],
        [2, 3],
      ],
    },
    {
      name: "unequal bars",
      input: [[1], [2, 3]],
      rate: 2,
      expected: [[1, 2, 3]],
    },
    {
      name: "sparse bars",
      input: [
        [1, 0, 2],
        [0, 3],
      ],
      rate: 2,
      expected: [[1, 0, 2, 0, 3]],
    },
    { name: "silence", input: [[0, 0], [0]], rate: 2, expected: [[0, 0, 0]] },
    {
      name: "fractional speed",
      input: [[1], [2], [3], [4], [5], [6]],
      rate: 1.5,
      expected: [
        [1, 0, 2],
        [0, 3, 0],
        [4, 0, 5],
        [0, 6, 0],
      ],
    },
    {
      name: "fractional slowdown",
      input: [[1]],
      rate: 0.5,
      expected: [[1], [0]],
    },
  ])("preserves fluent $name semantics", ({ input, rate, expected }) => {
    const result = fastEventCycle(mask(...input), rate);
    expect(numbers(result)).toEqual(expected);
    expect(numbers(result)).toEqual(
      new Speed().multiply(rate).applyTo(input, 0),
    );
    expectFrozen(result);
  });

  it("compresses weighted events as whole gates", () => {
    const result = fastEventCycle(cycle([event(60), continuation, rest]), 2);
    expect(result.patterns).toEqual([
      [event(60), continuation, rest, event(60), continuation, rest],
    ]);
    expect(geometry(result)).toEqual([
      [
        { offset: rational(0), duration: rational(1, 3), values: [60] },
        { offset: rational(1, 2), duration: rational(1, 3), values: [60] },
      ],
    ]);
  });
});

describe("slowEventCycle", () => {
  it("implements 60/2 as an event bar followed by a silent bar, not a sustained event", () => {
    const result = slowEventCycle(cycle([event(60)]), 2);
    expect(result.patterns).toEqual([[event(60)], [rest]]);
    expect(geometry(result)).toEqual([
      [{ offset: rational(0), duration: rational(1), values: [60] }],
      [],
    ]);
  });

  it("implements [0 2 4 6]/2 without extending quarter-bar gates", () => {
    const result = slowEventCycle(
      cycle([event(0), event(2), event(4), event(6)]),
      2,
    );
    expect(result.patterns).toEqual([
      [event(0), rest, event(2), rest],
      [event(4), rest, event(6), rest],
    ]);
    expect(geometry(result)).toEqual([
      [
        { offset: rational(0), duration: rational(1, 4), values: [0] },
        { offset: rational(1, 2), duration: rational(1, 4), values: [2] },
      ],
      [
        { offset: rational(0), duration: rational(1, 4), values: [4] },
        { offset: rational(1, 2), duration: rational(1, 4), values: [6] },
      ],
    ]);
  });

  it.each([
    {
      name: "rests",
      input: [[1, 0, 2, 0]],
      rate: 2,
      expected: [
        [1, 0, 0, 0],
        [2, 0, 0, 0],
      ],
    },
    {
      name: "unequal and silent bars",
      input: [[1, 2], [0], [3, 4, 5]],
      rate: 2,
      expected: [[1, 0], [2, 0], [0], [0], [3, 0, 4], [0, 5, 0]],
    },
    {
      name: "fractional rate",
      input: [[1]],
      rate: 1.5,
      expected: [
        [1, 0],
        [0, 1],
        [0, 0],
      ],
    },
    {
      name: "inverse acceleration",
      input: [[1], [2]],
      rate: 0.5,
      expected: [[1, 2]],
    },
  ])("preserves fluent $name semantics", ({ input, rate, expected }) => {
    const result = slowEventCycle(mask(...input), rate);
    expect(numbers(result)).toEqual(expected);
    expect(numbers(result)).toEqual(new Speed().divide(rate).applyTo(input, 0));
    expectFrozen(result);
  });

  it.each([
    {
      input: [event(60), continuation, rest, rest],
      expected: [
        [event(60), continuation, rest, rest],
        [rest, rest, rest, rest],
      ],
    },
    {
      input: [rest, event(60), continuation, rest],
      expected: [
        [rest, rest, event(60), continuation],
        [rest, rest, rest, rest],
      ],
    },
    {
      input: [event(60), continuation],
      expected: [
        [event(60), continuation],
        [rest, rest],
      ],
    },
  ])(
    "keeps a continuation run contiguous and its gate unextended",
    ({ input, expected }) => {
      const source = cycle(input);
      const result = slowEventCycle(source, 2);
      expect(result.patterns).toEqual(expected);
      expect(geometry(result)[0][0].duration).toEqual(
        geometry(source)[0][0].duration,
      );
      expectFrozen(result);
    },
  );

  it("checks every single-gate position on small grids with exact duration and boundary assertions", () => {
    for (let width = 1; width <= 6; width++) {
      for (let start = 0; start < width; start++) {
        for (let gate = 1; gate <= width - start; gate++) {
          const pattern = Array<EventStep<number>>(width).fill(rest);
          pattern[start] = event(60);
          for (let index = 1; index < gate; index++)
            pattern[start + index] = continuation;
          const source = cycle(pattern);
          const reversed = reverseEventCycle(source);
          expect(geometry(reversed)).toEqual([
            [
              {
                offset: createRational(width - start - gate, width),
                duration: createRational(gate, width),
                values: [60],
              },
            ],
          ]);
          expect(reverseEventCycle(reversed)).toEqual(source);
          for (const rate of [1, 2, 3]) {
            const position = start * rate;
            const local = position % width;
            if (local + gate > width) {
              expect(() => slowEventCycle(source, rate)).toThrow(
                "cross-bar continuation",
              );
              continue;
            }
            const result = slowEventCycle(source, rate);
            const expected = Array.from({ length: rate }, (_, bar) =>
              bar === Math.floor(position / width)
                ? [
                    {
                      offset: createRational(local, width),
                      duration: createRational(gate, width),
                      values: [60],
                    },
                  ]
                : [],
            );
            expect(geometry(result)).toEqual(expected);
            expectFrozen(result);
          }
        }
      }
    }
  });

  it("rejects cross-bar gates explicitly rather than dropping, extending, or retriggering them", () => {
    const source = cycle([rest, event(60), continuation, continuation]);
    const before = structuredClone(source);
    expect(() => slowEventCycle(source, 2)).toThrow("cross-bar continuation");
    expect(source).toEqual(before);
    expect(reverseEventCycle(source).patterns).toEqual([
      [event(60), continuation, continuation, rest],
    ]);
  });
});

describe("stretchEventCycle", () => {
  it.each([
    {
      name: "bar repetition",
      input: [[1], [2]],
      bars: 2,
      steps: 1,
      expected: [[1], [1], [2], [2]],
    },
    {
      name: "step repetition",
      input: [[1, 2, 3]],
      bars: 1,
      steps: 2,
      expected: [[1, 1, 2, 2, 3, 3]],
    },
    {
      name: "combined repetition",
      input: [[1, 0], [2]],
      bars: 2,
      steps: 2,
      expected: [
        [1, 1, 0, 0],
        [1, 1, 0, 0],
        [2, 2],
        [2, 2],
      ],
    },
    {
      name: "silent bars",
      input: [[0, 0], [1]],
      bars: 2,
      steps: 1,
      expected: [[0, 0], [0, 0], [1], [1]],
    },
  ])("preserves fluent $name semantics", ({ input, bars, steps, expected }) => {
    const result = stretchEventCycle(mask(...input), bars, steps);
    expect(numbers(result)).toEqual(expected);
    expect(numbers(result)).toEqual(stretch(input, bars, steps));
    expectFrozen(result);
  });

  it("defaults steps to one", () => {
    expect(stretchEventCycle(mask([1, 2]), 2)).toEqual(
      stretchEventCycle(mask([1, 2]), 2, 1),
    );
  });

  it("repeats complete weighted events instead of attaching duplicated continuations to the last onset", () => {
    const result = stretchEventCycle(
      cycle([event(60, 64), continuation, rest]),
      2,
      2,
    );
    const expected = [
      event(60, 64),
      continuation,
      event(60, 64),
      continuation,
      rest,
      rest,
    ];
    expect(result.patterns).toEqual([expected, expected]);
    expect(geometry(result)[0]).toEqual([
      { offset: rational(0), duration: rational(1, 3), values: [60, 64] },
      { offset: rational(1, 3), duration: rational(1, 3), values: [60, 64] },
    ]);
    expect(result.patterns[0]).not.toBe(result.patterns[1]);
    expect(result.patterns[0][0]).not.toBe(result.patterns[1][0]);
    expectFrozen(result);
  });
});

describe("composition and immutable structure", () => {
  it("matches repeated fluent transforms for unweighted input", () => {
    const input = [[1, 0, 2], [3], [0, 0]];
    const accelerated = new Speed().multiply(2).applyTo(input, 0);
    if (!accelerated) throw new Error("Expected materialized speed");
    const expected = new Speed()
      .divide(2)
      .applyTo(stretch(reverse(accelerated), 2, 2), 0);
    const result = slowEventCycle(
      stretchEventCycle(
        reverseEventCycle(fastEventCycle(mask(...input), 2)),
        2,
        2,
      ),
      2,
    );
    expect(numbers(result)).toEqual(expected);
    expectFrozen(result);
  });

  it("matches a reproducible matrix of unequal, sparse phrases against legacy pure utilities", () => {
    for (let bars = 1; bars <= 4; bars++) {
      for (let seed = 0; seed < 4; seed++) {
        const input = Array.from({ length: bars }, (_, bar) =>
          Array.from({ length: 1 + ((seed + bar) % 3) }, (_, step) =>
            (seed + bar + step) % 3 === 0 ? 0 : 1 + bar * 3 + step,
          ),
        );
        const source = mask(...input);
        expect(numbers(reverseEventCycle(source))).toEqual(reverse(input));
        expect(numbers(stretchEventCycle(source, 2, 2))).toEqual(
          stretch(input, 2, 2),
        );
        for (const rate of [1, 2, 3, 0.5, 1.5, 2 / 3, 3 / 4]) {
          expect(
            numbers(fastEventCycle(source, rate)),
            `fast: ${JSON.stringify({ input, rate })}`,
          ).toEqual(new Speed().multiply(rate).applyTo(input, 0));
          expect(
            numbers(slowEventCycle(source, rate)),
            `slow: ${JSON.stringify({ input, rate })}`,
          ).toEqual(new Speed().divide(rate).applyTo(input, 0));
        }
      }
    }
  });

  it("records zero-width legacy empty-bar compression for the pre-cutover provenance gate", () => {
    expect(new Speed().multiply(2).applyTo([[60], []], 0)).toEqual([[60]]);
    const source = cycle([event(60)], [rest]);
    const result = fastEventCycle(source, 2);
    expect(result.patterns).toEqual([[event(60), rest]]);
    expect(geometry(result)).toEqual([
      [{ offset: rational(0), duration: rational(1, 2), values: [60] }],
    ]);
    // A normalized silent bar has width; a legacy empty array has none during
    // compression. Fluid must resolve original empty-bar provenance in Step
    // 4.2 before promising full public-API parity, not guess inside transforms.
  });

  it("keeps inverse materialized speeds distinct from a future uninterrupted expression speed chain", () => {
    const input = cycle([event(60)]);
    expect(slowEventCycle(fastEventCycle(input, 2), 2).patterns).toEqual([
      [event(60), rest],
      [event(60), rest],
    ]);
    // Step 6.2 accumulates expression speed chains before materialization.
    expect(fastEventCycle(input, 1)).toEqual(input);
  });

  it.each(transforms)(
    "$name copies and freezes structure without freezing opaque payloads",
    ({ apply }) => {
      const payload = { frequency: 440 };
      const voices: [typeof payload, ...(typeof payload)[]] = [
        payload,
        payload,
      ];
      const step = { type: "event", values: voices } as const;
      const bar: EventStep<typeof payload>[] = [step, rest];
      const source = cycle(bar);
      const before = structuredClone(source);
      const result = apply(source);
      expect(source).toEqual(before);
      expect(Object.isFrozen(source)).toBe(false);
      expect(Object.isFrozen(bar)).toBe(false);
      expect(Object.isFrozen(voices)).toBe(false);
      expect(Object.isFrozen(payload)).toBe(false);
      const emitted = result.patterns
        .flat()
        .filter((item) => item.type === "event");
      expect(emitted.length).toBeGreaterThan(0);
      for (const item of emitted) {
        expect(item).not.toBe(step);
        expect(item.values).not.toBe(voices);
        expect(item.values).toEqual([payload, payload]);
        expect(item.values[0]).toBe(payload);
      }
      expectFrozen(result);
      voices.push(payload);
      bar.push(event(payload));
      expect(emitted.every((item) => item.values.length === 2)).toBe(true);
      expect(Reflect.set(result.patterns, "0", [rest])).toBe(false);
      expectTypeOf(result).toEqualTypeOf<StaticEventCycle<typeof payload>>();
    },
  );

  it.each(transforms)(
    "$name accepts frozen input and distinguishes null/undefined opaque event values from rests",
    ({ apply }) => {
      const input = Object.freeze({
        type: "static-event-cycle",
        patterns: Object.freeze([
          Object.freeze([
            Object.freeze(event<null | undefined>(null, undefined)),
            Object.freeze(rest),
          ]),
        ]),
      } as const);
      const result = apply(input);
      expect(
        result.patterns
          .flat()
          .some(
            (step) =>
              step.type === "event" &&
              step.values[0] === null &&
              step.values[1] === undefined,
          ),
      ).toBe(true);
      expectFrozen(result);
    },
  );

  it("keeps default fallback groups outside cycle transformation", () => {
    const fallback: [string, ...string[]] = ["bd", "hh"];
    const source = {
      intent: "default",
      fallback,
      cycle: cycle([event("bd", "hh")]),
    } as const;
    expect(slowEventCycle(source.cycle, 2).patterns).toEqual([
      [event("bd", "hh")],
      [rest],
    ]);
    expect(source.fallback).toBe(fallback);
    expect(Object.isFrozen(fallback)).toBe(false);
    expect(source.cycle.patterns).toEqual([[event("bd", "hh")]]);
  });

  it("retains payload and static/random branch inference through all public overloads", () => {
    const staticCycle = cycle([event("bd")]);
    const randomCycle = random(cycle([event<1>(1)]));
    expectTypeOf(reverseEventCycle(staticCycle)).toEqualTypeOf<
      StaticEventCycle<string>
    >();
    expectTypeOf(fastEventCycle(staticCycle, 2)).toEqualTypeOf<
      StaticEventCycle<string>
    >();
    expectTypeOf(slowEventCycle(staticCycle, 2)).toEqualTypeOf<
      StaticEventCycle<string>
    >();
    expectTypeOf(stretchEventCycle(staticCycle, 2)).toEqualTypeOf<
      StaticEventCycle<string>
    >();
    expectTypeOf(
      reverseEventCycle(randomCycle),
    ).toEqualTypeOf<RandomEventCycle>();
    expectTypeOf(
      fastEventCycle(randomCycle, 2),
    ).toEqualTypeOf<RandomEventCycle>();
    expectTypeOf(
      slowEventCycle(randomCycle, 2),
    ).toEqualTypeOf<RandomEventCycle>();
    expectTypeOf(
      stretchEventCycle(randomCycle, 2),
    ).toEqualTypeOf<RandomEventCycle>();
    const checkUnion = (union: EventCycle<number>) => {
      expectTypeOf(reverseEventCycle(union)).toEqualTypeOf<
        EventCycle<number>
      >();
      expectTypeOf(fastEventCycle(union, 2)).toEqualTypeOf<
        EventCycle<number>
      >();
      expectTypeOf(slowEventCycle(union, 2)).toEqualTypeOf<
        EventCycle<number>
      >();
      expectTypeOf(stretchEventCycle(union, 2)).toEqualTypeOf<
        EventCycle<number>
      >();
    };
    checkUnion(randomCycle);
  });
});

describe("random cycles", () => {
  it("reverses sparse candidate geometry and toggles generation order exactly once", () => {
    const source = random(
      cycle([event<1>(1), rest, event<1>(1)], [rest, rest]),
    );
    const before = structuredClone(source);
    const result = reverseEventCycle(source);
    expect(result.candidateCycle.patterns).toEqual([
      [rest, rest],
      [event(1), rest, event(1)],
    ]);
    expect(result.settings).toEqual({ ...source.settings, order: "reverse" });
    expect(reverseEventCycle(result)).toEqual(source);
    expect(source).toEqual(before);
  });

  it.each([
    {
      name: "fast",
      apply: (input: RandomEventCycle) => fastEventCycle(input, 2),
      expected: [[event(1), rest, rest, event(1), rest, rest]],
    },
    {
      name: "slow",
      apply: (input: RandomEventCycle) => slowEventCycle(input, 2),
      expected: [
        [event(1), rest, rest],
        [rest, rest, rest],
      ],
    },
    {
      name: "stretch",
      apply: (input: RandomEventCycle) => stretchEventCycle(input, 2, 2),
      expected: [
        [event(1), event(1), rest, rest, rest, rest],
        [event(1), event(1), rest, rest, rest, rest],
      ],
    },
  ])(
    "$name changes only candidate geometry, retaining numeric generation metadata",
    ({ apply, expected }) => {
      const source = random(cycle([event<1>(1), rest, rest]));
      const result = apply(source);
      expect(result.candidateCycle.patterns).toEqual(expected);
      expect(result.settings).toEqual(source.settings);
      expect(result.settings).not.toBe(source.settings);
      expect(result.settings.segments).not.toBe(source.settings.segments);
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.settings)).toBe(true);
      expect(Object.isFrozen(result.settings.range)).toBe(true);
      expect(Object.isFrozen(result.settings.valueMap)).toBe(true);
      expect(result.settings.segments.every(Object.isFrozen)).toBe(true);
      expectFrozen(result.candidateCycle);
      Reflect.set(source.settings.segments[0], "seed", 99);
      Reflect.set(source.settings.range, "min", 99);
      Reflect.set(source.settings.valueMap, "0", 99);
      expect(result.settings.segments[0].seed).toBe(7);
      expect(result.settings.range?.min).toBe(-2);
      expect(result.settings.valueMap?.[0]).toBe(7);
      expect(Object.keys(result)).toEqual([
        "type",
        "candidateCycle",
        "settings",
      ]);
    },
  );

  it("retains absent optional settings and silent candidate bars", () => {
    const input: RandomEventCycle = {
      type: "random-event-cycle",
      candidateCycle: cycle<1>([rest], [event<1>(1)]),
      settings: {
        dataType: "float",
        segments: [{ seed: 0 }],
        order: "forward",
        algorithm: "xor",
      },
    };
    const result = slowEventCycle(input, 2);
    expect(result.candidateCycle.patterns).toEqual([
      [rest],
      [rest],
      [event(1)],
      [rest],
    ]);
    expect(result.settings).toStrictEqual(input.settings);
    expect(result.settings).not.toHaveProperty("valueMap");
    expect(result.settings).not.toHaveProperty("range");
  });
});

describe("validation and bounded expansion", () => {
  it.each([0, -1, NaN, Infinity, -Infinity, Math.PI, 1 / 65])(
    "rejects invalid or unsupported speed %s",
    (rate) => {
      const source = cycle([event(60)]);
      expect(() => fastEventCycle(source, rate)).toThrow();
      expect(() => slowEventCycle(source, rate)).toThrow();
    },
  );

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid stretch dimensions %s",
    (value) => {
      const source = cycle([event(60)]);
      expect(() => stretchEventCycle(source, value)).toThrow(
        "bars must be a positive safe integer",
      );
      expect(() => stretchEventCycle(source, 1, value)).toThrow(
        "steps must be a positive safe integer",
      );
    },
  );

  it.each(transforms)(
    "$name validates the input before transforming",
    ({ apply }) => {
      expect(() => apply(cycle())).toThrow("at least one pattern");
      expect(() => apply(cycle([]))).toThrow("at least one step");
      expect(() => apply(cycle([continuation]))).toThrow(
        "continuation must follow",
      );
      expect(() => apply(cycle([rest, continuation]))).toThrow(
        "continuation must follow",
      );
    },
  );

  it.each(transforms)(
    "$name rejects unknown step tags instead of losing data or throwing incidental errors",
    ({ apply }) => {
      const malformed = { type: "rest" } as const;
      Reflect.set(malformed, "type", "unexpected");
      const source = cycle([event(60), malformed]);
      const before = structuredClone(source);
      expect(() => apply(source)).toThrow(
        "patterns[0][1] has unsupported step type unexpected",
      );
      expect(() => fastEventCycle(source, 1)).toThrow(
        "patterns[0][1] has unsupported step type unexpected",
      );
      expect(source).toEqual(before);
    },
  );

  it("validates numeric random settings and candidate values", () => {
    const invalid = random(cycle([event<1>(1)]));
    Reflect.set(invalid.settings, "quantValue", 0);
    expect(() => fastEventCycle(invalid, 2)).toThrow("quantValue");
    const candidate = random(cycle([event<1>(1)]));
    const onset = candidate.candidateCycle.patterns[0][0];
    if (onset.type !== "event") throw new Error("Expected onset");
    Reflect.set(onset.values, "0", 2);
    expect(() => slowEventCycle(candidate, 2)).toThrow(
      "exactly one onset value of 1",
    );
  });

  it("accepts exact pattern boundaries and rejects excessive expansion before allocation", () => {
    const source = cycle([event(60)]);
    expect(
      slowEventCycle(source, MAX_EVENT_CYCLE_PATTERNS).patterns,
    ).toHaveLength(MAX_EVENT_CYCLE_PATTERNS);
    expect(
      stretchEventCycle(source, MAX_EVENT_CYCLE_PATTERNS).patterns,
    ).toHaveLength(MAX_EVENT_CYCLE_PATTERNS);
    expect(() => slowEventCycle(source, MAX_EVENT_CYCLE_PATTERNS + 1)).toThrow(
      "1024 patterns",
    );
    expect(() => stretchEventCycle(source, Number.MAX_SAFE_INTEGER)).toThrow(
      "1024 patterns",
    );
    expect(() => slowEventCycle(source, Number.MAX_SAFE_INTEGER)).toThrow(
      "1024 patterns",
    );
  });

  it("accepts exact step boundaries and rejects unsafe-sized products before allocation", () => {
    const source = cycle([event(60)]);
    expect(
      fastEventCycle(source, MAX_EVENT_CYCLE_STEPS).patterns[0],
    ).toHaveLength(MAX_EVENT_CYCLE_STEPS);
    expect(
      stretchEventCycle(source, 1, MAX_EVENT_CYCLE_STEPS).patterns[0],
    ).toHaveLength(MAX_EVENT_CYCLE_STEPS);
    expect(() => fastEventCycle(source, MAX_EVENT_CYCLE_STEPS + 1)).toThrow(
      "16384 steps",
    );
    expect(() => fastEventCycle(source, Number.MAX_SAFE_INTEGER)).toThrow(
      "16384 steps",
    );
    expect(() => stretchEventCycle(source, 1, Number.MAX_SAFE_INTEGER)).toThrow(
      "16384 steps",
    );
    expect(() =>
      stretchEventCycle(
        source,
        MAX_EVENT_CYCLE_PATTERNS,
        Number.MAX_SAFE_INTEGER,
      ),
    ).toThrow("16384 steps");
    expect(() =>
      slowEventCycle(
        cycle(Array<EventStep<number>>(17).fill(rest)),
        MAX_EVENT_CYCLE_PATTERNS,
      ),
    ).toThrow("16384 steps");
  });

  it("counts whole-phrase repetitions when bounding voices", () => {
    const voices: [number, ...number[]] = [60, ...Array<number>(127).fill(64)];
    const source = cycle([event(...voices)]);
    const repetitions = MAX_EVENT_CYCLE_VOICES / voices.length;
    expect(fastEventCycle(source, repetitions).patterns[0]).toHaveLength(
      repetitions,
    );
    expect(stretchEventCycle(source, 1, repetitions).patterns[0]).toHaveLength(
      repetitions,
    );
    expect(() => fastEventCycle(source, repetitions + 1)).toThrow(
      "65536 voices",
    );
    expect(() => stretchEventCycle(source, 1, repetitions + 1)).toThrow(
      "65536 voices",
    );
    const phrase = cycle(
      ...Array.from({ length: 512 }, () => [event(...voices)]),
    );
    expect(() => fastEventCycle(phrase, 3)).toThrow("65536 voices");
    expect(() => slowEventCycle(phrase, 2 / 3)).toThrow("65536 voices");
  });

  it("preserves maximum valid input under identity and reversal", () => {
    const source = cycle(
      Array<EventStep<number>>(MAX_EVENT_CYCLE_STEPS).fill(rest),
    );
    expect(reverseEventCycle(source)).toEqual(source);
    expect(fastEventCycle(source, 1)).toEqual(source);
    expect(slowEventCycle(source, 1)).toEqual(source);
    expect(stretchEventCycle(source, 1)).toEqual(source);
  });
});
