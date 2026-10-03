import { describe, expect, it } from "vitest";
import {
  type EventPattern,
  type StaticEventCycle,
  type RandomEventCycle,
} from "./cycle";
import {
  transformEventCycleGeometry,
  type EventCycleTransform,
} from "./transforms";
import Speed from "../cycles/operations/speed";
import { MAX_EVENT_CYCLE_PATTERNS } from "../limits";

const event = <T>(value: T) =>
  ({ type: "event", values: [value] as const }) as const;
const rest = { type: "rest" } as const;
function cycle<T>(...patterns: EventPattern<T>[]) {
  return { type: "static-event-cycle", patterns } as const;
}
function numbers(input: StaticEventCycle<number>, flags: readonly boolean[]) {
  return input.patterns.map((pattern, index) =>
    flags[index]
      ? []
      : pattern.map((step) => (step.type === "event" ? step.values[0] : 0)),
  );
}

describe("event geometry with zero-width provenance", () => {
  it("distinguishes empty bars from explicit silent subdivisions during compression", () => {
    const input = cycle([event(60)], [rest]);
    const operation = { type: "fast", multiplier: 2 } as const;
    expect(
      transformEventCycleGeometry(input, operation, [false, true]).cycle
        .patterns,
    ).toEqual([[event(60)]]);
    expect(
      transformEventCycleGeometry(input, operation).cycle.patterns,
    ).toEqual([[event(60), rest]]);
    expect(input.patterns).toEqual([[event(60)], [rest]]);
  });

  it("preserves zero-width flags through reversal, stretch, and entirely empty speed groups", () => {
    const input = cycle([rest], [event(60)], [rest]);
    const flags = [true, false, true];
    const reversed = transformEventCycleGeometry(
      input,
      { type: "reverse" },
      flags,
    );
    expect(reversed.zeroWidthPatterns).toEqual([true, false, true]);
    const stretched = transformEventCycleGeometry(
      input,
      { type: "stretch", bars: 2, steps: 2 },
      flags,
    );
    expect(stretched.zeroWidthPatterns).toEqual([
      true,
      true,
      false,
      false,
      true,
      true,
    ]);
    const slowed = transformEventCycleGeometry(
      cycle([rest]),
      { type: "slow", multiplier: 2 },
      [true],
    );
    expect(slowed.cycle.patterns).toEqual([[rest], [rest]]);
    expect(slowed.zeroWidthPatterns).toEqual([true, true]);
    expect(Object.isFrozen(slowed.zeroWidthPatterns)).toBe(true);
    expect(Object.isFrozen(slowed.cycle.patterns[0])).toBe(true);
    expect(flags).toEqual([true, false, true]);
    expect(Object.isFrozen(flags)).toBe(false);
  });

  it("matches exact legacy compression/expansion for a bounded empty-bar matrix", () => {
    for (let seed = 0; seed < 16; seed++) {
      const source = Array.from({ length: 1 + (seed % 4) }, (_, bar) =>
        (seed + bar) % 3 === 0 ? [] : [bar + 1, 0, bar + 2],
      );
      const flags = source.map((bar) => bar.length === 0);
      const input = cycle(
        ...source.map((bar) =>
          bar.length === 0
            ? [rest]
            : bar.map((value) => (value === 0 ? rest : event(value))),
        ),
      );
      for (const multiplier of [1, 2, 3, 0.5, 1.5, 2 / 3]) {
        const result = transformEventCycleGeometry(
          input,
          { type: "fast", multiplier },
          flags,
        );
        expect(
          numbers(result.cycle, result.zeroWidthPatterns),
          JSON.stringify({ seed, multiplier }),
        ).toEqual(new Speed().multiply(multiplier).applyTo(source, 0));
      }
    }
  });

  it("keeps random empty candidates separate from generation settings and reverses order once", () => {
    const input: RandomEventCycle = {
      type: "random-event-cycle",
      candidateCycle: cycle([event<1>(1), event<1>(1)], [rest]),
      settings: {
        dataType: "integer",
        segments: [{ seed: 7 }],
        order: "forward",
        algorithm: "xor",
        range: { min: 0, max: 8 },
      },
    };
    const compressed = transformEventCycleGeometry(
      input,
      { type: "fast", multiplier: 2 },
      [false, true],
    );
    expect(compressed.cycle.candidateCycle.patterns).toEqual([
      [event(1), event(1)],
    ]);
    expect(compressed.cycle.settings).toEqual(input.settings);
    const reversed = transformEventCycleGeometry(input, { type: "reverse" }, [
      false,
      true,
    ]);
    expect(reversed.zeroWidthPatterns).toEqual([true, false]);
    expect(reversed.cycle.settings.order).toBe("reverse");
    expect(input.settings.order).toBe("forward");
    expect(Object.isFrozen(compressed.cycle.settings.segments[0])).toBe(true);
    expect(Object.isFrozen(compressed.cycle.settings.range)).toBe(true);
  });

  it("rejects mismatched provenance and excessive expansion before traversing enormous empty groups", () => {
    const input = cycle([event(60)], [rest]);
    for (const flags of [[false], [true, false], [false, false, false]])
      expect(() =>
        transformEventCycleGeometry(input, { type: "reverse" }, flags),
      ).toThrow("Zero-width provenance");
    expect(() =>
      transformEventCycleGeometry(
        cycle([rest]),
        { type: "fast", multiplier: Number.MAX_SAFE_INTEGER },
        [true],
      ),
    ).toThrow("source patterns");
    expect(() =>
      transformEventCycleGeometry(
        cycle([rest]),
        { type: "slow", multiplier: MAX_EVENT_CYCLE_PATTERNS + 1 },
        [true],
      ),
    ).toThrow("1024 patterns");
    const operations: EventCycleTransform[] = [
      { type: "fast", multiplier: 0 },
      { type: "slow", multiplier: Infinity },
      { type: "stretch", bars: 0 },
      { type: "stretch", bars: 1, steps: 0 },
    ];
    for (const operation of operations)
      expect(() => transformEventCycleGeometry(input, operation)).toThrow();
  });
});
