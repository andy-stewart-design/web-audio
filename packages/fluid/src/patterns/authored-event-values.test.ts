import { RandomCycle } from "@web-audio/patterns";
import { describe, expect, it } from "vitest";
import {
  createDefaultAuthoredEventValues,
  createAuthoredEventValues,
  hasAuthoredEventValueRests,
} from "./authored-event-values";

describe("authored event values", () => {
  it("normalizes bars, hits, voices, and rests without assigning timing", () => {
    const values = createAuthoredEventValues<number>([
      [0, [1, 2], null],
      [],
      [3],
    ]);

    expect(values).toEqual({
      explicit: true,
      source: {
        type: "static",
        cycle: [[[0], [1, 2], null], [null], [[3]]],
      },
    });
    expect(hasAuthoredEventValueRests(values)).toBe(true);
  });

  it("keeps the default variation distinct from an authored zero", () => {
    expect(createDefaultAuthoredEventValues(0).explicit).toBe(false);
    expect(createAuthoredEventValues<number>([0]).explicit).toBe(true);
  });

  it("preserves random values as scalar event sources", () => {
    const cycle = new RandomCycle().int().steps(4);

    expect(createAuthoredEventValues([cycle])).toEqual({
      explicit: true,
      source: { type: "random", cycle },
    });
  });

  it("rejects invalid authored event values", () => {
    expect(() =>
      createAuthoredEventValues([[[0, null]]], {
        invalidRestMessage: "rest",
      }),
    ).toThrow("rest");
    expect(() =>
      createAuthoredEventValues([[[]]], {
        invalidGroupMessage: "group",
      }),
    ).toThrow("group");
  });
});
