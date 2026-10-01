import { describe, expect, it } from "vitest";
import type { EventPattern, NonEmptyGroup } from "./cycle";
import {
  MAX_EVENT_CYCLE_STEPS,
  MAX_EVENT_CYCLE_VOICES,
  MAX_EVENT_GROUP_VOICES,
} from "../limits";
import {
  getEventPatternGeometry,
  normalizeEventPattern,
  type EventSpan,
} from "./grid";
import { createRational } from "../math/rational";

function event(
  values: NonEmptyGroup<number>,
  offset: number,
  width: number,
  resolution: number,
) {
  return {
    offset: createRational(offset, resolution),
    duration: createRational(width, resolution),
    step: { type: "event", values },
  } as const satisfies EventSpan<number>;
}
function rest(offset: number, width: number, resolution: number) {
  return {
    offset: createRational(offset, resolution),
    duration: createRational(width, resolution),
    step: { type: "rest" },
  } as const satisfies EventSpan<number>;
}

const onset = (value: number) => ({ type: "event", values: [value] }) as const;
const silence = { type: "rest" } as const;
const continuation = { type: "continuation" } as const;

describe("normalizeEventPattern", () => {
  it("finds the smallest grid rather than padding to an arbitrary resolution", () => {
    expect(
      normalizeEventPattern([
        event([60], 0, 2, 6),
        event([64], 2, 2, 6),
        event([67], 4, 2, 6),
      ]),
    ).toEqual([onset(60), onset(64), onset(67)]);
  });

  it("normalizes unequal allocations with continuations, not extra retriggers", () => {
    expect(
      normalizeEventPattern([
        event([60], 0, 2, 6),
        event([64], 2, 1, 6),
        event([67], 3, 1, 6),
        event([72], 4, 2, 6),
      ]),
    ).toEqual([
      onset(60),
      continuation,
      onset(64),
      onset(67),
      onset(72),
      continuation,
    ]);
  });

  it("keeps explicit rests distinct from extended event gates", () => {
    const pattern = normalizeEventPattern([
      event([60], 0, 2, 4),
      rest(2, 1, 4),
      event([67], 3, 1, 4),
    ]);
    expect(pattern).toEqual([onset(60), continuation, silence, onset(67)]);
    expect(getEventPatternGeometry(pattern)).toEqual([
      {
        offset: createRational(0),
        duration: createRational(1, 2),
        values: [60],
      },
      {
        offset: createRational(3, 4),
        duration: createRational(1, 4),
        values: [67],
      },
    ]);
  });

  it("retains silent subdivisions and expands wide rests as rests", () => {
    expect(normalizeEventPattern([rest(0, 1, 2), rest(1, 1, 2)])).toEqual([
      silence,
      silence,
    ]);
    expect(
      normalizeEventPattern([
        rest(0, 2, 4),
        event([60], 2, 1, 4),
        event([67], 3, 1, 4),
      ]),
    ).toEqual([silence, silence, onset(60), onset(67)]);
    expect(getEventPatternGeometry([silence, silence])).toEqual([]);
  });

  it("copies and freezes structural output without freezing caller-owned payloads", () => {
    const payload = { note: 60 };
    const values: [typeof payload, ...(typeof payload)[]] = [payload, payload];
    const spans = [
      {
        offset: createRational(0),
        duration: createRational(1),
        step: { type: "event", values },
      },
    ] as const;
    const snapshot = structuredClone(spans);
    const pattern = normalizeEventPattern(spans);
    expect(spans).toEqual(snapshot);
    expect(Object.isFrozen(pattern)).toBe(true);
    const step = pattern[0];
    expect(Object.isFrozen(step)).toBe(true);
    if (step.type !== "event") throw new Error("Expected event");
    expect(Object.isFrozen(step.values)).toBe(true);
    expect(step.values).not.toBe(values);
    expect(step.values[0]).toBe(payload);
    expect(Object.isFrozen(payload)).toBe(false);
    expect(Object.keys(step)).toEqual(["type", "values"]);
    values.push({ note: 67 });
    expect(step.values).toHaveLength(2);
    expect(Reflect.set(step.values, "0", { note: 72 })).toBe(false);
  });

  it("accepts the exact normalized step limit and rejects a smaller budget before expansion", () => {
    const spans = [
      event([60], 0, 1, MAX_EVENT_CYCLE_STEPS),
      rest(1, MAX_EVENT_CYCLE_STEPS - 1, MAX_EVENT_CYCLE_STEPS),
    ];
    expect(normalizeEventPattern(spans)).toHaveLength(MAX_EVENT_CYCLE_STEPS);
    expect(() =>
      normalizeEventPattern(spans, MAX_EVENT_CYCLE_STEPS - 1),
    ).toThrow("steps");
  });

  it.each([0, -1, NaN, Infinity, 1.5, MAX_EVENT_CYCLE_STEPS + 1])(
    "rejects invalid step budgets: %s",
    (budget) => {
      expect(() => normalizeEventPattern([rest(0, 1, 1)], budget)).toThrow(
        "Grid step budget",
      );
    },
  );

  it("enforces per-group and total voice limits", () => {
    const values: [number, ...number[]] = [
      60,
      ...Array<number>(MAX_EVENT_GROUP_VOICES - 1).fill(60),
    ];
    const count = MAX_EVENT_CYCLE_VOICES / MAX_EVENT_GROUP_VOICES;
    const spans = Array.from({ length: count }, (_, index) =>
      event(values, index, 1, count),
    );
    expect(normalizeEventPattern(spans)).toHaveLength(count);
    const excessive = Array.from({ length: count + 1 }, (_, index) =>
      event(values, index, 1, count + 1),
    );
    expect(() => normalizeEventPattern(excessive)).toThrow(
      "more than 65536 voices",
    );
    expect(() =>
      normalizeEventPattern([event([60, ...values], 0, 1, 1)]),
    ).toThrow("1 to 128 voices");
    const empty = event([60], 0, 1, 1);
    Reflect.set(empty.step, "values", []);
    expect(() => normalizeEventPattern([empty])).toThrow("1 to 128 voices");
  });

  it.each([
    { name: "no allocations", spans: [], error: "at least one allocation" },
    {
      name: "zero duration",
      spans: [rest(0, 0, 1)],
      error: "positive durations",
    },
    {
      name: "negative duration",
      spans: [rest(0, -1, 1)],
      error: "positive durations",
    },
    {
      name: "leading gap",
      spans: [rest(1, 1, 2)],
      error: "ordered, contiguous",
    },
    {
      name: "overlap",
      spans: [rest(0, 1, 2), rest(0, 1, 2)],
      error: "ordered, contiguous",
    },
    {
      name: "unordered spans",
      spans: [rest(1, 1, 2), rest(0, 1, 2)],
      error: "ordered, contiguous",
    },
    { name: "trailing gap", spans: [rest(0, 1, 2)], error: "exactly one bar" },
    { name: "bar overflow", spans: [rest(0, 2, 1)], error: "beyond one bar" },
  ])("rejects $name without mutating allocations", ({ spans, error }) => {
    const before = structuredClone(spans);
    expect(() => normalizeEventPattern(spans)).toThrow(error);
    expect(spans).toEqual(before);
  });
});

describe("getEventPatternGeometry", () => {
  it("derives offsets and durations from continuation runs, stopping at rests and retriggers", () => {
    const pattern: EventPattern<number> = [
      onset(60),
      continuation,
      continuation,
      silence,
      onset(60),
      onset(67),
    ];
    expect(getEventPatternGeometry(pattern)).toEqual([
      {
        offset: createRational(0),
        duration: createRational(1, 2),
        values: [60],
      },
      {
        offset: createRational(2, 3),
        duration: createRational(1, 6),
        values: [60],
      },
      {
        offset: createRational(5, 6),
        duration: createRational(1, 6),
        values: [67],
      },
    ]);
  });

  it("preserves voice order and duplicates in independently frozen derived data", () => {
    const values: [number, ...number[]] = [67, 60, 60];
    const pattern: EventPattern<number> = [{ type: "event", values }];
    const geometry = getEventPatternGeometry(pattern);
    expect(geometry[0].values).toEqual([67, 60, 60]);
    expect(Object.isFrozen(geometry)).toBe(true);
    expect(Object.isFrozen(geometry[0])).toBe(true);
    expect(Object.isFrozen(geometry[0].offset)).toBe(true);
    expect(Object.isFrozen(geometry[0].duration)).toBe(true);
    expect(Object.isFrozen(geometry[0].values)).toBe(true);
    values[0] = 72;
    expect(geometry[0].values[0]).toBe(67);
  });

  it.each([
    { pattern: [] },
    { pattern: [continuation] },
    { pattern: [silence, continuation] },
  ])(
    "validates canonical input before deriving geometry: $pattern",
    ({ pattern }) => {
      expect(() => getEventPatternGeometry(pattern)).toThrow("[Pattern]");
    },
  );
});
