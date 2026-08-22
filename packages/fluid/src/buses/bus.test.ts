import { describe, expect, it } from "vitest";
import Drome from "@/index";

describe("Bus builder", () => {
  it("normalizes main and returns one shared builder", () => {
    const d = new Drome();

    expect(d.bus(" main ")).toBe(d.bus("main"));
  });

  it("configures main gain with last-write-wins semantics", () => {
    const d = new Drome();

    d.bus("main").gain(0.5).gain(1.25);

    expect(d.getSchema().buses).toEqual({
      main: { gain: 1.25, effects: [] },
    });
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid gain %s",
    (value) => {
      expect(() => new Drome().bus("main").gain(value)).toThrow(
        "[Bus] gain() must be a finite number greater than or equal to 0.",
      );
    },
  );

  it("accepts zero gain", () => {
    const d = new Drome();

    expect(d.bus("main").gain(0)).toBe(d.bus("main"));
    expect(d.getSchema().buses.main.gain).toBe(0);
  });

  it("rejects empty names and normalizes named buses", () => {
    const d = new Drome();

    expect(() => d.bus("   ")).toThrow("[Bus] name cannot be empty.");
    expect(d.bus(" drums ")).toBe(d.bus("drums"));
    expect(d.bus("drums").gain(0.75).getSchema()).toEqual({
      gain: 0.75,
      effects: [],
    });
  });

  it("rejects effects on main", () => {
    const d = new Drome();

    expect(() => d.bus("main").fx(d.lpf(800))).toThrow(
      "[Bus] Effects on main are not supported in the bus MVP.",
    );
  });

  it("appends named bus effects in exact call order", () => {
    const d = new Drome();
    const bus = d.bus("drums").fx(d.lpf(800)).fx(d.gain(0.5), d.hpf(200));

    expect(bus.getSchema().effects.map((effect) => effect.type)).toEqual([
      "filter",
      "gain",
      "filter",
    ]);
  });

  it.each([
    ["cycling", (d: Drome) => d.lpf([400, 800])],
    ["random", (d: Drome) => d.lpf(d.rand().range(400, 800))],
    ["envelope", (d: Drome) => d.lpf(d.env(0, 800))],
    ["LFO", (d: Drome) => d.lpf(d.lfo(400, 800))],
  ])("rejects %s bus parameters at schema creation", (_label, effect) => {
    const d = new Drome();
    d.bus("drums").fx(effect(d));

    expect(() => d.getSchema()).toThrow(
      '[Schema] Bus "drums" effects[0].frequency must be one finite constant static value.',
    );
  });
});
