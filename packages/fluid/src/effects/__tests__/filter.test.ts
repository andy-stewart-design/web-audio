import { createStructuredInput, RandomCycle } from "@web-audio/patterns";
import type { FilterType } from "@web-audio/schema";
import { describe, expect, it, vi } from "vitest";
import Envelope from "@/automations/envelope";
import Lfo from "@/automations/lfo";
import Drome from "@/drome";
import Parameter from "@/parameters/parameter";
import Filter from "../filter";

describe("Filter", () => {
  it("uses fixed named parameters in the constructor and factory", () => {
    expect(Filter).toHaveLength(2);
    expect(new Drome().filter).toHaveLength(2);
  });

  it("serializes frequency and defaults as value-only patterns", () => {
    const schema = new Filter("lp", 800).getSchema();

    expect(schema).toMatchObject({ type: "filter", filterType: "lp" });
    expect(schema.frequency).toEqual({ type: "static", cycle: [[800]] });
    expect(schema.q).toEqual({ type: "static", cycle: [[1]] });
    expect(schema.detune).toEqual({ type: "static", cycle: [[0]] });
    expect(schema.gain).toEqual({ type: "static", cycle: [[0]] });
  });

  it("round-trips every filter type", () => {
    const types: FilterType[] = [
      "lp",
      "hp",
      "bp",
      "notch",
      "ap",
      "pk",
      "ls",
      "hs",
    ];

    for (const type of types) {
      expect(new Filter(type, 1_000).getSchema().filterType).toBe(type);
    }
  });

  it("serializes q, detune, and gain setters as raw values", () => {
    const schema = new Filter("lp", 800)
      .q([1, 2])
      .detune(100)
      .gain(6)
      .getSchema();

    expect(schema.q).toEqual({ type: "static", cycle: [[1, 2]] });
    expect(schema.detune).toEqual({ type: "static", cycle: [[100]] });
    expect(schema.gain).toEqual({ type: "static", cycle: [[6]] });
  });

  it("requires one explicit frequency slot at both public boundaries", () => {
    expect(
      new Filter("lp", new Drome().str(400, 800)).getSchema().frequency,
    ).toEqual({
      type: "static",
      cycle: [[400], [800]],
    });
    expect(() => Reflect.construct(Filter, ["lp"])).toThrow(
      "frequency is required",
    );
    expect(() =>
      Reflect.apply(new Drome().filter, new Drome(), ["lp"]),
    ).toThrow("frequency is required");
    expect(() => Reflect.construct(Filter, ["lp", 400, 800])).toThrow(
      "one frequency value",
    );
    expect(() =>
      Reflect.apply(new Drome().filter, new Drome(), ["lp", 400, 800]),
    ).toThrow("one frequency value");
    expect(() => Reflect.construct(Filter, ["lp", undefined])).toThrow();
    expect(() => Reflect.construct(Filter, [])).toThrow("type is required");
    expect(() => Reflect.apply(new Drome().filter, new Drome(), [])).toThrow(
      "filter type is required",
    );
  });

  it("keeps permitted direct sources live without eager serialization", () => {
    const drome = new Drome();
    const envelope = new Envelope();
    const lfo = new Lfo(400, 800);
    const midi = drome.midi.cc(74);
    const random = new RandomCycle().steps(2);
    const envelopeSchema = vi.spyOn(envelope, "getSchema");
    const lfoSchema = vi.spyOn(lfo, "getSchema");
    const midiSchema = vi.spyOn(midi, "getSchema");
    const randomSchema = vi.spyOn(random, "getRandomSchema");

    const filter = new Filter("lp", envelope);
    expect(Reflect.get(filter, "_frequency")).toBe(envelope);
    expect(envelopeSchema).not.toHaveBeenCalled();
    expect(Reflect.get(new Filter("lp", lfo), "_frequency")).toBe(lfo);
    expect(Reflect.get(new Filter("lp", midi), "_frequency")).toBe(midi);
    expect(Reflect.get(new Filter("lp", random), "_frequency")).toBeInstanceOf(
      Object,
    );
    expect(lfoSchema).not.toHaveBeenCalled();
    expect(midiSchema).not.toHaveBeenCalled();
    expect(randomSchema).not.toHaveBeenCalled();

    envelope.max(2);
    expect(filter.getSchema().frequency).toMatchObject({ type: "envelope" });
    expect(envelopeSchema).toHaveBeenCalledTimes(1);
  });

  it.each(["lpf", "hpf", "bpf"] as const)(
    "%s preserves variadic geometry, omitted input, and legacy array aliasing",
    (method) => {
      const drome = new Drome();
      expect(drome[method](400, 800, 1_200).getSchema().frequency).toEqual({
        type: "static",
        cycle: [[400], [800], [1_200]],
      });
      expect(drome[method]([400, 800], [1_200]).getSchema().frequency).toEqual({
        type: "static",
        cycle: [[400, 800], [1_200]],
      });
      expect(
        drome[method](drome.str([400, 800], 1_200)).getSchema().frequency,
      ).toEqual({ type: "static", cycle: [[400, 800], [1_200]] });
      expect(drome[method]().getSchema().frequency).toEqual({
        type: "static",
        cycle: [],
      });

      const values = [400, 800];
      const alias = drome[method](values, 1_200);
      values[0] = 900;
      expect(alias.getSchema().frequency).toEqual({
        type: "static",
        cycle: [[900, 800], [1_200]],
      });
    },
  );

  it.each(["lpf", "hpf", "bpf"] as const)(
    "%s preserves direct source identity, MIDI context, and random configuration",
    (method) => {
      const drome = new Drome();
      const envelope = new Envelope(200, 4_000);
      const lfo = new Lfo(400, 800);
      const midi = drome.midi.cc(74);
      const random = drome.rand().steps(2).range(400, 800).ribbon(7);
      const control = drome.rand().steps(2).range(400, 800).ribbon(7);
      const sources = [envelope, lfo, midi];
      const spies = sources.map((source) => vi.spyOn(source, "getSchema"));
      const randomSchema = vi.spyOn(random, "getRandomSchema");
      const filters = [
        drome[method](envelope),
        drome[method](lfo),
        drome[method](midi),
      ];
      const randomFilter = drome[method](random);
      expect(spies.every((spy) => spy.mock.calls.length === 0)).toBe(true);
      expect(randomSchema).not.toHaveBeenCalled();
      for (const [index, filter] of filters.entries()) {
        expect(Reflect.get(filter, "_frequency")).toBe(sources[index]);
      }

      envelope.max(6_000);
      expect(filters[0].getSchema().frequency).toEqual(envelope.getSchema());
      expect(filters[1].getSchema().frequency).toEqual(lfo.getSchema());
      expect(filters[2].getSchema().frequency).toEqual(
        midi.getSchema("frequency"),
      );
      random.steps(3).range(500, 1_000).ribbon(11);
      control.steps(3).range(500, 1_000).ribbon(11);
      expect(randomFilter.getSchema().frequency).toEqual(
        control.getRandomSchema(),
      );
    },
  );

  it("keeps constructor and factory parity for all single frequency forms", () => {
    const drome = new Drome();
    const values = [
      400,
      "400 800",
      drome.sh("400 800"),
      drome.str([400, 800], 1_200),
      createStructuredInput(400, 800),
      drome.rand().steps(2).range(400, 800),
      new Envelope(200, 4_000),
      new Lfo(400, 800),
      drome.midi.cc(74),
    ];
    for (const value of values) {
      expect(drome.filter("lp", value).getSchema()).toEqual(
        new Filter("lp", value).getSchema(),
      );
    }
  });

  it("rejects invalid frequencies and extra arguments at both public boundaries", () => {
    const drome = new Drome();
    const invalidValues: unknown[] = [
      [400, 800],
      undefined,
      null,
      NaN,
      Infinity,
      -Infinity,
      true,
      {},
      new Parameter(400),
      drome.str("400"),
      drome.str(null),
      drome.str([[400, 800]]),
      drome.str([]),
      [drome.str(400)],
    ];
    const invalidArguments = invalidValues.map((value) => ["lp", value]);
    invalidArguments.push(
      ["lp", 400, 800],
      ["lp", 400, {}],
      ["lp", drome.str(400), 800],
      ["lp", drome.env(200, 4_000), 800],
      ["lp", drome.lfo(400, 800), undefined],
      ["lp", drome.midi.cc(74), 800],
      ["lp", drome.rand(), 800],
    );
    for (const args of invalidArguments) {
      expect(() => Reflect.construct(Filter, args)).toThrow(/Filter/);
      expect(() => Reflect.apply(drome.filter, drome, args)).toThrow(/filter/i);
    }
  });

  it("retains variadic setters and leaves fields unchanged after invalid replacements", () => {
    const drome = new Drome();
    const filter = new Filter("lp", 800).q([1, 2], 3).detune(10, 20).gain(4, 5);
    const before = filter.getSchema();
    expect(before.q).toEqual({ type: "static", cycle: [[1, 2], [3]] });
    for (const setter of [filter.q, filter.detune, filter.gain]) {
      expect(() => Reflect.apply(setter, filter, [drome.str(1), 2])).toThrow();
      expect(filter.getSchema()).toEqual(before);
    }
  });

  it("serializes random frequency and q values with per-bar counts", () => {
    const schema = new Filter(
      "lp",
      new RandomCycle().steps(1, 2).range(400, 800),
    )
      .q(new RandomCycle().steps(3).range(0, 10))
      .getSchema();

    expect(schema.frequency).toMatchObject({
      type: "random-number",
      valuesPerBar: [1, 2],
      range: { min: 400, max: 800 },
    });
    expect(schema.q).toMatchObject({
      type: "random-number",
      valuesPerBar: [3],
      range: { min: 0, max: 10 },
    });
  });

  it("passes filter frequency context to MIDI sources", () => {
    const drome = new Drome();
    const midi = drome.midi.cc(74);
    expect(drome.filter("lp", midi).getSchema().frequency).toMatchObject({
      type: "midi-cc",
      range: { min: 20, max: 20_000, curve: "exponential" },
      default: 1_000,
    });
    expect(drome.lpf(midi).getSchema().frequency).toMatchObject({
      type: "midi-cc",
      range: { min: 20, max: 20_000, curve: "exponential" },
      default: 1_000,
    });
  });

  it("accepts an envelope parameter without adding timing to its values", () => {
    const schema = new Filter("lp", new Envelope(200, 4_000)).getSchema();

    expect(schema.frequency.type).toBe("envelope");
    if (schema.frequency.type !== "envelope") {
      throw new Error("Expected envelope frequency");
    }
    expect(schema.frequency.min).toEqual({
      type: "static",
      cycle: [[200]],
    });
    expect(schema.frequency.max).toEqual({
      type: "static",
      cycle: [[4_000]],
    });
  });

  it("preserves setter chaining", () => {
    const filter = new Filter("lp", 800);

    expect(filter.q(2)).toBe(filter);
    expect(filter.detune(0)).toBe(filter);
    expect(filter.gain(0)).toBe(filter);
    expect(filter.getSchema()).toMatchObject({
      q: { type: "static", cycle: [[2]] },
      detune: { type: "static", cycle: [[0]] },
      gain: { type: "static", cycle: [[0]] },
    });
  });
});
