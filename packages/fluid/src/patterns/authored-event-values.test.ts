import { RandomCycle } from "@web-audio/patterns";
import { describe, expect, it } from "vitest";
import AuthoredEventValues from "./authored-event-values";

describe("authored event values", () => {
  it("normalizes bars, hits, voices, and rests without assigning timing", () => {
    const values = AuthoredEventValues.fromInput<number>([
      [0, [1, 2], null],
      [],
      [3],
    ]);

    expect(values.hasAuthoredValues).toBe(true);
    expect(values.source).toEqual({
      type: "static",
      cycle: [[[0], [1, 2], null], [null], [[3]]],
    });
    expect(values.hasRests).toBe(true);
  });

  it("keeps the default variation distinct from an authored zero", () => {
    expect(AuthoredEventValues.fromDefault<number>(0).hasAuthoredValues).toBe(
      false,
    );
    const authored = AuthoredEventValues.fromInput<number>([0]);
    expect(authored.hasAuthoredValues).toBe(true);
    expect(authored.source).toEqual({ type: "static", cycle: [[[0]]] });
  });

  it("preserves random values as scalar event sources", () => {
    const cycle = new RandomCycle().int().steps(4);
    const values = AuthoredEventValues.fromInput<number>([cycle]);

    expect(values.hasAuthoredValues).toBe(true);
    expect(values.source).toEqual({ type: "random", cycle });
  });

  it("rejects invalid authored event values", () => {
    expect(() =>
      AuthoredEventValues.fromInput([[[0, null]]], {
        invalidRestMessage: "rest",
      }),
    ).toThrow("rest");
    expect(() =>
      AuthoredEventValues.fromInput([[[]]], {
        invalidGroupMessage: "group",
      }),
    ).toThrow("group");
  });
});
