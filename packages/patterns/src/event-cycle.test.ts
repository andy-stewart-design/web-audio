import { describe, expect, expectTypeOf, it } from "vitest";
import {
  assertEventCycleInvariants,
  RandomCycle,
  type EventCycle,
  type EventPattern,
  type EventStep,
  type NonEmptyGroup,
  type RandomEventCycle,
  type RandomEventSettings,
  type StaticEventCycle,
} from "./index";
import {
  MAX_EVENT_CYCLE_PATTERNS,
  MAX_EVENT_CYCLE_STEPS,
  MAX_EVENT_CYCLE_VOICES,
  MAX_EVENT_GROUP_VOICES,
  MAX_RANDOM_EVENT_SETTINGS_ITEMS,
} from "./utils/cycle-limits";

const event = {
  type: "event",
  values: [60],
} as const satisfies EventStep<number>;
const rest = { type: "rest" } as const;
const continuation = { type: "continuation" } as const;

function createStaticCycle<T>(patterns: readonly EventPattern<T>[]) {
  return {
    type: "static-event-cycle",
    patterns,
  } as const satisfies StaticEventCycle<T>;
}

function createRandomCycle(overrides: Partial<RandomEventSettings> = {}) {
  const cycle: RandomEventCycle = {
    type: "random-event-cycle",
    candidateCycle: createStaticCycle<1>([
      [{ type: "event", values: [1] }, rest],
      [rest],
    ]),
    settings: {
      dataType: "float",
      segments: [{ seed: 0 }],
      algorithm: "xor",
      order: "forward",
      ...overrides,
    },
  };
  return cycle;
}

function createGroup(size: number) {
  const values: NonEmptyGroup<number> = [
    60,
    ...Array.from({ length: size - 1 }, () => 60),
  ];
  return { type: "event", values } as const;
}

describe("event-cycle types", () => {
  it("narrows static and random numeric cycles independently", () => {
    expectTypeOf<EventCycle<number>>().toEqualTypeOf<
      StaticEventCycle<number> | RandomEventCycle
    >();
    expectTypeOf<EventCycle<string>>().toEqualTypeOf<
      StaticEventCycle<string>
    >();
    expectTypeOf<EventCycle<1>>().toEqualTypeOf<StaticEventCycle<1>>();
    expectTypeOf<EventPattern<number>>().toEqualTypeOf<
      readonly EventStep<number>[]
    >();
    expectTypeOf<NonEmptyGroup<number>>().toEqualTypeOf<
      readonly [number, ...number[]]
    >();

    const cycles: readonly EventCycle<number>[] = [
      createStaticCycle([[event, continuation, rest]]),
      createRandomCycle(),
    ];
    for (const cycle of cycles) {
      if (cycle.type === "static-event-cycle") {
        expectTypeOf(cycle).toEqualTypeOf<StaticEventCycle<number>>();
      } else {
        expectTypeOf(cycle).toEqualTypeOf<RandomEventCycle>();
        expectTypeOf(cycle.settings).toEqualTypeOf<RandomEventSettings>();
      }
    }
  });

  it("requires nonempty voice groups and readonly structural data", () => {
    // Compile-time checks only: this function must never execute.
    const attemptInvalidConstruction = (
      cycle: StaticEventCycle<number>,
      step: Extract<EventStep<number>, { type: "event" }>,
      random: RandomEventCycle,
    ) => {
      // @ts-expect-error An event group cannot be empty.
      const emptyGroup: NonEmptyGroup<number> = [];
      // @ts-expect-error Numeric random generation is not a sample-name cycle.
      const names: EventCycle<string> = random;
      // @ts-expect-error The cycle discriminant is readonly.
      cycle.type = "static-event-cycle";
      // @ts-expect-error Cycle patterns cannot be replaced.
      cycle.patterns = [];
      // @ts-expect-error Cycle patterns cannot be appended.
      cycle.patterns.push([rest]);
      // @ts-expect-error Pattern steps cannot be reordered.
      cycle.patterns[0].reverse();
      // @ts-expect-error Event values cannot be replaced.
      step.values = [64];
      // @ts-expect-error Event voices cannot be appended.
      step.values.push(64);
      // @ts-expect-error Candidate geometry cannot be replaced.
      random.candidateCycle = cycle;
      // @ts-expect-error Random settings cannot be replaced.
      random.settings = createRandomCycle().settings;
      // @ts-expect-error Numeric settings are readonly.
      random.settings.dataType = "integer";
      // @ts-expect-error Random segments cannot be appended.
      random.settings.segments.push({ seed: 1 });
      // @ts-expect-error Segment seeds are readonly.
      random.settings.segments[0].seed = 1;
      if (random.settings.range) {
        // @ts-expect-error Range endpoints are readonly.
        random.settings.range.min = 0;
      }
      if (random.settings.valueMap) {
        // @ts-expect-error Value maps cannot be reordered.
        random.settings.valueMap.reverse();
      }
      // @ts-expect-error Numeric settings cannot store timing chance.
      random.settings.chance = 0.5;
      return { emptyGroup, names };
    };
    expectTypeOf(attemptInvalidConstruction).toBeFunction();
  });
});

describe("static event cycles", () => {
  it("distinguishes events, explicit rests, and continuation runs", () => {
    const cycle = createStaticCycle([
      [
        event,
        continuation,
        continuation,
        rest,
        { type: "event", values: [67] },
      ],
      [rest, rest],
      [event],
    ]);
    expect(assertEventCycleInvariants(cycle)).toBeUndefined();
    expect(
      cycle.patterns.map((pattern) => pattern.map((step) => step.type)),
    ).toEqual([
      ["event", "continuation", "continuation", "rest", "event"],
      ["rest", "rest"],
      ["event"],
    ]);
    expect(Object.keys(cycle)).toEqual(["type", "patterns"]);
    expect(Object.keys(cycle.patterns[0][0])).toEqual(["type", "values"]);
    expect(Object.keys(cycle.patterns[0][1])).toEqual(["type"]);
  });

  it("preserves explicit silent patterns and different pattern resolutions", () => {
    const cycle = createStaticCycle([
      [rest],
      [event, rest, rest],
      [rest, rest],
    ]);
    const before = JSON.stringify(cycle);
    assertEventCycleInvariants(cycle);
    expect(cycle.patterns.map((pattern) => pattern.length)).toEqual([1, 3, 2]);
    expect(JSON.stringify(cycle)).toBe(before);
  });

  it("preserves simultaneous voice order and duplicates", () => {
    const cycle = createStaticCycle<number>([
      [{ type: "event", values: [67, 60, 60, 64] }],
    ]);
    assertEventCycleInvariants(cycle);
    expect(cycle.patterns[0]).toEqual([
      { type: "event", values: [67, 60, 60, 64] },
    ]);
  });

  it("leaves generic payload interpretation to the consumer", () => {
    const payload = { nested: [null, 1], type: "custom" };
    const cycle = createStaticCycle([[{ type: "event", values: [payload] }]]);
    assertEventCycleInvariants(cycle);
    const step = cycle.patterns[0][0];
    if (step.type === "event") expect(step.values[0]).toBe(payload);
    expect(
      assertEventCycleInvariants(
        createStaticCycle<string>([
          [{ type: "event", values: ["sd", "bd", "bd"] }],
        ]),
      ),
    ).toBeUndefined();
  });

  it("accepts deeply frozen data without adding or changing fields", () => {
    const frozenEvent = Object.freeze({
      type: "event",
      values: Object.freeze([60, 60, 67] as const),
    } as const);
    const frozenRest = Object.freeze({ type: "rest" } as const);
    const frozenContinuation = Object.freeze({ type: "continuation" } as const);
    const cycle = Object.freeze(
      createStaticCycle(
        Object.freeze([
          Object.freeze([frozenEvent, frozenContinuation, frozenRest]),
          Object.freeze([frozenRest]),
        ]),
      ),
    );
    const before = JSON.stringify(cycle);
    expect(assertEventCycleInvariants(cycle)).toBeUndefined();
    expect(JSON.stringify(cycle)).toBe(before);
    expect(JSON.parse(before)).toEqual(cycle);
  });

  it("rejects an empty cycle", () => {
    expect(() => assertEventCycleInvariants(createStaticCycle([]))).toThrow(
      "Event cycle must contain at least one pattern",
    );
  });

  it("rejects empty patterns instead of silently normalizing them", () => {
    expect(() =>
      assertEventCycleInvariants(createStaticCycle([[event], []])),
    ).toThrow(
      "patterns[1] must contain at least one step; use a rest for silence",
    );
  });

  it("rejects an empty voice group at runtime too", () => {
    const step = { type: "event", values: [60] } as const;
    // Simulate malformed JavaScript input without weakening the model's types.
    Reflect.set(step, "values", []);
    expect(() =>
      assertEventCycleInvariants(createStaticCycle([[step]])),
    ).toThrow("patterns[0][0] must contain a nonempty voice group");
  });

  it.each([
    { name: "at the beginning of a pattern", patterns: [[continuation]] },
    { name: "after a rest", patterns: [[event, rest, continuation]] },
    {
      name: "after a prior pattern's event",
      patterns: [[event], [continuation]],
    },
    {
      name: "after a prior pattern's continuation",
      patterns: [[event, continuation], [continuation]],
    },
    {
      name: "inside an otherwise silent pattern",
      patterns: [[rest, continuation]],
    },
  ])("rejects a continuation $name", ({ patterns }) => {
    expect(() =>
      assertEventCycleInvariants(createStaticCycle(patterns)),
    ).toThrow(
      "continuation must follow an event or continuation in the same pattern",
    );
  });
});

describe("event-cycle limits", () => {
  it("enforces the exact pattern-count boundary", () => {
    const patterns = Array.from({ length: MAX_EVENT_CYCLE_PATTERNS }, () => [
      rest,
    ]);
    expect(
      assertEventCycleInvariants(createStaticCycle(patterns)),
    ).toBeUndefined();
    expect(() =>
      assertEventCycleInvariants(createStaticCycle([...patterns, [rest]])),
    ).toThrow(`more than ${MAX_EVENT_CYCLE_PATTERNS} patterns`);
  });

  it.each([event, rest, continuation])(
    "counts $type steps toward the exact total step bound",
    (step) => {
      const pattern = [
        event,
        ...Array.from({ length: MAX_EVENT_CYCLE_STEPS - 1 }, () => step),
      ];
      expect(
        assertEventCycleInvariants(createStaticCycle([pattern])),
      ).toBeUndefined();
      expect(() =>
        assertEventCycleInvariants(createStaticCycle([pattern, [rest]])),
      ).toThrow(`more than ${MAX_EVENT_CYCLE_STEPS} steps`);
    },
  );

  it("rejects an oversized single pattern before traversing its steps", () => {
    const pattern = Array.from(
      { length: MAX_EVENT_CYCLE_STEPS + 1 },
      () => rest,
    );
    expect(() =>
      assertEventCycleInvariants(createStaticCycle([pattern])),
    ).toThrow(`more than ${MAX_EVENT_CYCLE_STEPS} steps`);
  });

  it("enforces the exact per-event voice bound without deduplicating voices", () => {
    expect(
      assertEventCycleInvariants(
        createStaticCycle([[createGroup(MAX_EVENT_GROUP_VOICES)]]),
      ),
    ).toBeUndefined();
    expect(() =>
      assertEventCycleInvariants(
        createStaticCycle([[createGroup(MAX_EVENT_GROUP_VOICES + 1)]]),
      ),
    ).toThrow(
      `patterns[0][0] contains more than ${MAX_EVENT_GROUP_VOICES} voices`,
    );
  });

  it("counts every voice occurrence across patterns toward the total voice bound", () => {
    const group = createGroup(MAX_EVENT_GROUP_VOICES);
    const eventCount = MAX_EVENT_CYCLE_VOICES / MAX_EVENT_GROUP_VOICES;
    const patterns = [
      Array.from({ length: eventCount / 2 }, () => group),
      Array.from({ length: eventCount / 2 }, () => group),
    ];
    expect(
      assertEventCycleInvariants(createStaticCycle(patterns)),
    ).toBeUndefined();
    expect(() =>
      assertEventCycleInvariants(createStaticCycle([...patterns, [event]])),
    ).toThrow(`more than ${MAX_EVENT_CYCLE_VOICES} voices`);
  });
});

describe("random event cycles", () => {
  it("retains actual candidate geometry rather than reconstructing it from counts", () => {
    const source = new RandomCycle()
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
    const patterns = source
      .getFixedTimingCycle()
      .current.map((pattern) =>
        pattern.length === 0
          ? [rest]
          : pattern.map<EventStep<1>>((value) =>
              value === 1 ? { type: "event", values: [1] } : rest,
            ),
      );
    const cycle: RandomEventCycle = {
      type: "random-event-cycle",
      candidateCycle: createStaticCycle(patterns),
      settings: {
        dataType: schema.dataType,
        segments: schema.segments,
        range: schema.range,
        quantValue: schema.quantValue,
        algorithm: schema.algorithm,
        order: schema.order,
      },
    };
    const before = JSON.stringify(cycle);
    expect(assertEventCycleInvariants(cycle)).toBeUndefined();
    // Reverse leaves each onset at step 3 of a four-step pattern. Counts alone
    // would incorrectly infer a full-bar onset at step 0.
    expect(cycle.candidateCycle.patterns).toEqual([
      [rest, rest, rest, { type: "event", values: [1] }],
      [rest, rest, rest, { type: "event", values: [1] }],
    ]);
    expect(
      cycle.candidateCycle.patterns.map(
        (pattern) => pattern.filter((step) => step.type === "event").length,
      ),
    ).toEqual(schema.valuesPerBar);
    expect(cycle.settings).toEqual({
      dataType: "integer",
      segments: [
        { seed: 7, len: 4 },
        { seed: 11, len: 8 },
      ],
      range: { min: -2, max: 8 },
      quantValue: 0.25,
      algorithm: "mulberry",
      order: "reverse",
    });
    expect(JSON.stringify(cycle)).toBe(before);
    expect(Object.keys(cycle)).toEqual(["type", "candidateCycle", "settings"]);
  });

  it.each(["float", "integer", "binary"] as const)(
    "retains %s numeric generation without materializing values",
    (dataType) => {
      const cycle = createRandomCycle({ dataType });
      expect(assertEventCycleInvariants(cycle)).toBeUndefined();
      expect(cycle.settings.dataType).toBe(dataType);
      expect(cycle.candidateCycle.patterns[1]).toEqual([rest]);
      expect(cycle).not.toHaveProperty("valuesPerPattern");
      expect(cycle).not.toHaveProperty("condition");
    },
  );

  it("preserves binary value maps separately from onset geometry", () => {
    const cycle = createRandomCycle({ dataType: "binary", valueMap: [60, 72] });
    assertEventCycleInvariants(cycle);
    expect(cycle.settings.valueMap).toEqual([60, 72]);
    expect(cycle.candidateCycle.patterns[0][0]).toEqual({
      type: "event",
      values: [1],
    });
  });

  it("supports candidate continuations and silent patterns", () => {
    const cycle: RandomEventCycle = {
      ...createRandomCycle(),
      candidateCycle: createStaticCycle<1>([
        [{ type: "event", values: [1] }, continuation, rest],
        [rest, rest],
      ]),
    };
    expect(assertEventCycleInvariants(cycle)).toBeUndefined();
  });

  it("validates frozen random geometry and nested settings without mutation", () => {
    const candidate = Object.freeze({
      type: "event",
      values: Object.freeze([1] as const),
    } as const);
    const cycle = Object.freeze({
      type: "random-event-cycle",
      candidateCycle: Object.freeze(
        createStaticCycle<1>(
          Object.freeze([
            Object.freeze([candidate]),
            Object.freeze([Object.freeze(rest)]),
          ]),
        ),
      ),
      settings: Object.freeze({
        dataType: "binary",
        segments: Object.freeze([Object.freeze({ seed: 7, len: 4 })]),
        range: Object.freeze({ min: -1, max: 2 }),
        valueMap: Object.freeze([60, 72]),
        quantValue: 0.5,
        algorithm: "xor",
        order: "reverse",
      }),
    } as const satisfies RandomEventCycle);
    const before = JSON.stringify(cycle);
    expect(assertEventCycleInvariants(cycle)).toBeUndefined();
    expect(JSON.stringify(cycle)).toBe(before);
    expect(JSON.parse(before)).toEqual(cycle);
  });

  it("applies canonical structural invariants to random candidate geometry", () => {
    const cycle: RandomEventCycle = {
      ...createRandomCycle(),
      candidateCycle: createStaticCycle<1>([[continuation]]),
    };
    expect(() => assertEventCycleInvariants(cycle)).toThrow(
      "continuation must follow an event",
    );
  });

  it.each([{ values: [1, 1] }, { values: [0] }, { values: [60] }])(
    "rejects malformed random candidate voice groups $values",
    ({ values }) => {
      const cycle = createRandomCycle();
      const step = cycle.candidateCycle.patterns[0][0];
      Reflect.set(step, "values", values);
      expect(() => assertEventCycleInvariants(cycle)).toThrow(
        "must contain exactly one onset value of 1",
      );
    },
  );

  it("applies the pattern and step bounds to random geometry too", () => {
    const cycle = createRandomCycle();
    expect(() =>
      assertEventCycleInvariants({
        ...cycle,
        candidateCycle: createStaticCycle(
          Array.from({ length: MAX_EVENT_CYCLE_PATTERNS + 1 }, () => [rest]),
        ),
      }),
    ).toThrow(`more than ${MAX_EVENT_CYCLE_PATTERNS} patterns`);
    expect(() =>
      assertEventCycleInvariants({
        ...cycle,
        candidateCycle: createStaticCycle([
          Array.from({ length: MAX_EVENT_CYCLE_STEPS + 1 }, () => rest),
        ]),
      }),
    ).toThrow(`more than ${MAX_EVENT_CYCLE_STEPS} steps`);
  });

  it.each(["dataType", "algorithm", "order"] as const)(
    "rejects an invalid numeric %s setting",
    (field) => {
      const cycle = createRandomCycle();
      Reflect.set(cycle.settings, field, "unsupported");
      expect(() => assertEventCycleInvariants(cycle)).toThrow(
        `${field} is invalid`,
      );
    },
  );

  it.each(["chance", "condition"])(
    "rejects timing %s in numeric settings",
    (field) => {
      const cycle = createRandomCycle();
      Reflect.set(cycle.settings, field, 0.5);
      expect(() => assertEventCycleInvariants(cycle)).toThrow(
        "cannot contain a timing chance condition",
      );
    },
  );

  it.each([
    {
      name: "empty segments",
      settings: { segments: [] },
      error: "at least one segment",
    },
    {
      name: "non-finite seed",
      settings: { segments: [{ seed: Infinity }] },
      error: "seed must be finite",
    },
    {
      name: "zero segment length",
      settings: { segments: [{ seed: 1, len: 0 }] },
      error: "length must be a positive finite integer",
    },
    {
      name: "fractional segment length",
      settings: { segments: [{ seed: 1, len: 1.5 }] },
      error: "length must be a positive finite integer",
    },
    {
      name: "negative segment length",
      settings: { segments: [{ seed: 1, len: -1 }] },
      error: "length must be a positive finite integer",
    },
    {
      name: "infinite segment length",
      settings: { segments: [{ seed: 1, len: Infinity }] },
      error: "length must be a positive finite integer",
    },
    {
      name: "mixed unbounded segments",
      settings: { segments: [{ seed: 1 }, { seed: 2, len: 4 }] },
      error: "unbounded segment only by itself",
    },
    {
      name: "non-finite range",
      settings: { range: { min: 0, max: NaN } },
      error: "range endpoints and span must be finite",
    },
    {
      name: "overflowing range span",
      settings: { range: { min: -Number.MAX_VALUE, max: Number.MAX_VALUE } },
      error: "range endpoints and span must be finite",
    },
    {
      name: "zero quantization",
      settings: { quantValue: 0 },
      error: "quantValue must be a positive finite number",
    },
    {
      name: "negative quantization",
      settings: { quantValue: -0.5 },
      error: "quantValue must be a positive finite number",
    },
    {
      name: "infinite quantization",
      settings: { quantValue: Infinity },
      error: "quantValue must be a positive finite number",
    },
    {
      name: "empty value map",
      settings: { valueMap: [] },
      error: "valueMap must contain safely indexable values",
    },
    {
      name: "non-finite value map",
      settings: { valueMap: [60, NaN] },
      error: "valueMap must contain only finite numbers",
    },
    {
      name: "undersized binary value map",
      settings: { dataType: "binary", valueMap: [60] },
      error: "valueMap must contain safely indexable values",
    },
  ] satisfies {
    name: string;
    settings: Partial<RandomEventSettings>;
    error: string;
  }[])("rejects $name", ({ settings, error }) => {
    expect(() =>
      assertEventCycleInvariants(createRandomCycle(settings)),
    ).toThrow(error);
  });

  it("allows finite signed seeds and descending ranges as existing random settings do", () => {
    expect(
      assertEventCycleInvariants(
        createRandomCycle({
          segments: [{ seed: -2.5 }],
          range: { min: 8, max: -2 },
        }),
      ),
    ).toBeUndefined();
  });

  it("enforces the exact random segment count bound", () => {
    const segments = Array.from(
      { length: MAX_RANDOM_EVENT_SETTINGS_ITEMS },
      () => ({ seed: 1, len: 4 }),
    );
    expect(
      assertEventCycleInvariants(createRandomCycle({ segments })),
    ).toBeUndefined();
    expect(() =>
      assertEventCycleInvariants(
        createRandomCycle({
          segments: [...segments, { seed: 1, len: 4 }],
        }),
      ),
    ).toThrow(`more than ${MAX_RANDOM_EVENT_SETTINGS_ITEMS} segments`);
  });

  it("enforces the exact random value map size bound", () => {
    const valueMap = Array.from(
      { length: MAX_RANDOM_EVENT_SETTINGS_ITEMS },
      () => 60,
    );
    expect(
      assertEventCycleInvariants(createRandomCycle({ valueMap })),
    ).toBeUndefined();
    expect(() =>
      assertEventCycleInvariants(
        createRandomCycle({ valueMap: [...valueMap, 64] }),
      ),
    ).toThrow(`more than ${MAX_RANDOM_EVENT_SETTINGS_ITEMS} values`);
  });
});
