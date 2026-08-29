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
      main: { gain: 1.25, transition: 0, effects: [] },
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

  it("configures transition as a fraction of a bar", () => {
    const d = new Drome();
    const bus = d.bus("drums");

    expect(bus.transition(0.25)).toBe(bus);
    expect(bus.getSchema().transition).toBe(0.25);
  });

  it("provides an extracted-safe trans() alias", () => {
    const bus = new Drome().bus("drums");
    const trans = bus.trans;

    expect(trans(0.5)).toBe(bus);
    expect(bus.getSchema().transition).toBe(0.5);
  });

  it.each([-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid transition %s",
    (value) => {
      expect(() => new Drome().bus("drums").transition(value)).toThrow(
        "[Bus] transition() must be a finite number in [0, 1].",
      );
    },
  );

  it("rejects empty names and normalizes named buses", () => {
    const d = new Drome();

    expect(() => d.bus("   ")).toThrow("[Bus] name cannot be empty.");
    expect(d.bus(" drums ")).toBe(d.bus("drums"));
    expect(d.bus("drums").gain(0.75).getSchema()).toEqual({
      gain: 0.75,
      transition: 0,
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

  it("serializes multi-bar static gain and filter parameters", () => {
    const d = new Drome();
    d.bus("drums").fx(d.gain(1, 0.5), d.lpf(400, 800));

    const [gain, filter] = d.getSchema().buses.drums.effects;
    expect(gain.type).toBe("gain");
    if (gain.type === "gain" && gain.gain.type === "static") {
      expect(gain.gain.cycle.map((bar) => bar[0].value)).toEqual([1, 0.5]);
    }
    expect(filter.type).toBe("filter");
    if (filter.type === "filter" && filter.frequency.type === "static") {
      expect(filter.frequency.cycle.map((bar) => bar[0].value)).toEqual([
        400, 800,
      ]);
    }
  });

  it("accepts intra-bar static steps while preserving their schema", () => {
    const d = new Drome();
    d.bus("drums").fx(d.gain([1, 0.5]), d.lpf([400, 800]));

    const [gain, filter] = d.getSchema().buses.drums.effects;
    if (gain.type === "gain" && gain.gain.type === "static") {
      expect(gain.gain.cycle[0].map((step) => step.value)).toEqual([1, 0.5]);
    }
    if (filter.type === "filter" && filter.frequency.type === "static") {
      expect(filter.frequency.cycle[0].map((step) => step.value)).toEqual([
        400, 800,
      ]);
    }
  });

  it("serializes deterministic random gain and filter parameters", () => {
    const d = new Drome();
    d.bus("drums").fx(
      d.gain(d.rand().range(0.25, 0.75).rib(1, 2)),
      d.lpf(d.rand().range(400, 800).rib(2, 3)),
    );

    const [gain, filter] = d.getSchema().buses.drums.effects;
    if (gain.type === "gain" && gain.gain.type === "random") {
      expect(gain.gain.range).toEqual({ min: 0.25, max: 0.75 });
      expect(gain.gain.segments).toEqual([{ seed: 1, len: 2 }]);
    }
    if (filter.type === "filter" && filter.frequency.type === "random") {
      expect(filter.frequency.range).toEqual({ min: 400, max: 800 });
      expect(filter.frequency.segments).toEqual([{ seed: 2, len: 3 }]);
    }
  });

  it.each([
    ["envelope", (d: Drome) => d.lpf(d.env(0, 800))],
    ["LFO", (d: Drome) => d.lpf(d.lfo(400, 800))],
  ])("rejects %s bus parameters at schema creation", (_label, effect) => {
    const d = new Drome();
    d.bus("drums").fx(effect(d));

    expect(() => d.getSchema()).toThrow(
      '[Schema] Bus "drums" effects[0].frequency must be a finite bar-resolvable static or random parameter.',
    );
  });
});
