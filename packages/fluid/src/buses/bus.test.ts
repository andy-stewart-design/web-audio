import { describe, expect, it } from "vitest";
import Drome from "@/index";

describe("Bus builder", () => {
  it("normalizes main and returns one shared builder", () => {
    const drome = new Drome();

    expect(drome.bus(" main ")).toBe(drome.bus("main"));
  });

  it("configures main gain with last-write-wins semantics", () => {
    const drome = new Drome();
    drome.bus("main").gain(0.5).gain(1.25);

    expect(drome.getSchema().buses).toEqual({
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

  it("preserves zero bus gain", () => {
    const bus = new Drome().bus("main");

    expect(bus.gain(0)).toBe(bus);
    expect(bus.getSchema().gain).toBe(0);
  });

  it("configures transition and supports the extracted trans alias", () => {
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
    const drome = new Drome();

    expect(() => drome.bus("   ")).toThrow("[Bus] name cannot be empty.");
    expect(drome.bus(" drums ")).toBe(drome.bus("drums"));
  });

  it("rejects effects on main", () => {
    const drome = new Drome();

    expect(() => drome.bus("main").fx(drome.lpf(800))).toThrow(
      "[Bus] Effects on main are not supported in the bus MVP.",
    );
  });

  it("appends named bus effects in call order", () => {
    const drome = new Drome();
    const bus = drome
      .bus("drums")
      .fx(drome.lpf(800))
      .fx(drome.gain(0.5), drome.hpf(200));

    expect(bus.getSchema().effects.map((effect) => effect.type)).toEqual([
      "filter",
      "gain",
      "filter",
    ]);
  });

  it("serializes static bus effect parameters as raw bar values", () => {
    const drome = new Drome();
    const bus = drome.bus("drums").fx(drome.gain(1, 0.5), drome.lpf(400, 800));
    const [gain, filter] = bus.getSchema().effects;

    expect(gain).toMatchObject({
      type: "gain",
      gain: { type: "static", cycle: [[1], [0.5]] },
    });
    expect(filter).toMatchObject({
      type: "filter",
      frequency: { type: "static", cycle: [[400], [800]] },
    });
  });

  it("serializes intra-bar bus effect values without timing", () => {
    const drome = new Drome();
    const bus = drome
      .bus("drums")
      .fx(drome.gain([1, 0.5]), drome.lpf([400, 800]));
    const [gain, filter] = bus.getSchema().effects;

    expect(gain).toMatchObject({
      type: "gain",
      gain: { type: "static", cycle: [[1, 0.5]] },
    });
    expect(filter).toMatchObject({
      type: "filter",
      frequency: { type: "static", cycle: [[400, 800]] },
    });
  });

  it("serializes deterministic random bus effect parameters", () => {
    const drome = new Drome();
    const bus = drome
      .bus("drums")
      .fx(
        drome.gain(drome.rand().steps(2).range(0.25, 0.75).rib(1, 2)),
        drome.lpf(drome.rand().steps(3).range(400, 800).rib(2, 3)),
      );
    const [gain, filter] = bus.getSchema().effects;

    expect(gain).toMatchObject({
      type: "gain",
      gain: {
        type: "random-number",
        valuesPerBar: [2],
        range: { min: 0.25, max: 0.75 },
        segments: [{ seed: 1, len: 2 }],
      },
    });
    expect(filter).toMatchObject({
      type: "filter",
      frequency: {
        type: "random-number",
        valuesPerBar: [3],
        range: { min: 400, max: 800 },
        segments: [{ seed: 2, len: 3 }],
      },
    });
  });
});
