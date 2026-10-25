import {
  createShorthand,
  createStructuredInput,
  RandomCycle,
} from "@web-audio/patterns";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import Drome from "@/drome";
import Parameter from "@/parameters/parameter";
import Lfo from "../lfo";

describe("Lfo", () => {
  afterEach(() => vi.restoreAllMocks());

  it("produces a valid default schema", () => {
    const schema = new Lfo(800, 400).getSchema();
    expect(schema.type).toBe("lfo");
    expect(schema.speed).toEqual([1]);
    expect(schema.waveform).toEqual(["sine"]);
    expect(schema.phase).toBe(0);
    expect(schema.norm).toBe(false);
  });

  it("generates a unique id per instance", () => {
    const a = new Lfo(800, 400).getSchema();
    const b = new Lfo(800, 400).getSchema();
    expect(a.id).not.toBe(b.id);
  });

  it("requires exactly two endpoints at both public boundaries", () => {
    const d = new Drome();
    expect(Lfo).toHaveLength(2);
    expect(d.lfo).toHaveLength(2);
    for (const args of [[], [0], [0, 1, 2]]) {
      expect(() => Reflect.construct(Lfo, args)).toThrow();
      expect(() => Reflect.apply(d.lfo, d, args)).toThrow();
    }
  });

  it("serializes static outputA and outputB as raw values", () => {
    const schema = new Lfo(800, 400).getSchema();
    expect(schema.outputA).toEqual({ type: "static", cycle: [[800]] });
    expect(schema.outputB).toEqual({ type: "static", cycle: [[400]] });
  });

  it("keeps constructor and factory endpoint geometry identical", () => {
    const d = new Drome();
    const cases = [
      [800, 400],
      ["0.2 0.8", "400"],
      [createShorthand("<0.2 0.8>"), createShorthand("400 800")],
      [createStructuredInput(0.2, 0.8), createStructuredInput([400, 800])],
    ] as const;

    for (const [outputA, outputB] of cases) {
      const constructorSchema = new Lfo(outputA, outputB).getSchema();
      const factorySchema = d.lfo(outputA, outputB).getSchema();
      const { id: constructorId, ...constructorRest } = constructorSchema;
      const { id: factoryId, ...factoryRest } = factorySchema;
      expect(constructorId).not.toBe(factoryId);
      expect(constructorRest).toEqual(factoryRest);
    }
  });

  it("snapshots structured bars while preserving reusable shorthand for two endpoints", () => {
    const d = new Drome();
    const original = [600, 800];
    const structured = createStructuredInput(original);
    const reusable = d.sh("0.2 0.8");
    const first = new Lfo(structured, reusable);
    const second = new Lfo(structured, reusable);
    original[0] = 1_200;

    expect(first.getSchema().outputA).toEqual({
      type: "static",
      cycle: [[600, 800]],
    });
    expect(second.getSchema().outputB).toEqual({
      type: "static",
      cycle: [[0.2, 0.8]],
    });
    expect(second.getSchema().outputB).toEqual(first.getSchema().outputB);
  });

  it("interprets structured endpoint bars independently", () => {
    const lfo = new Lfo(
      createStructuredInput(600, 800),
      createStructuredInput(400, 500),
    );

    const schema = lfo.getSchema();
    expect(schema.outputA).toEqual({
      type: "static",
      cycle: [[600], [800]],
    });
    expect(schema.outputB).toEqual({
      type: "static",
      cycle: [[400], [500]],
    });
  });

  it("supports RandomCycle on outputB and retains its source reference", () => {
    const random = new RandomCycle().steps(2, 4);
    const lfo = new Lfo(800, random);

    expect(lfo.getSchema().outputB).toMatchObject({
      type: "random-number",
      valuesPerBar: [2, 4],
    });
    random.steps(3);
    expect(lfo.getSchema().outputB).toMatchObject({
      type: "random-number",
      valuesPerBar: [3],
    });
  });

  it("does not serialize direct random endpoints before construction finishes", () => {
    const randomA = new RandomCycle().steps(2);
    const randomB = new RandomCycle().steps(1, 3);
    const controlRandomA = new RandomCycle().steps(2);
    const controlRandomB = new RandomCycle().steps(1, 3);
    const randomASchema = vi.spyOn(randomA, "getRandomSchema");
    const randomBSchema = vi.spyOn(randomB, "getRandomSchema");
    const lfo = new Drome().lfo(randomA, randomB);
    const control = new Lfo(controlRandomA, controlRandomB);

    expect(randomASchema).not.toHaveBeenCalled();
    expect(randomBSchema).not.toHaveBeenCalled();
    randomA.steps(3, 1).range(0.25, 1);
    randomB.steps(2, 4).range(10, 20);
    controlRandomA.steps(3, 1).range(0.25, 1);
    controlRandomB.steps(2, 4).range(10, 20);
    const schema = lfo.getSchema();
    const controlSchema = control.getSchema();
    expect(schema.outputA).toEqual(controlSchema.outputA);
    expect(schema.outputB).toEqual(controlSchema.outputB);
  });

  it("accepts direct and reusable shorthand independently at both endpoints", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const direct = new Lfo("0.2 0.8", "<400 800>").getSchema();
      const reusable = new Lfo(
        createShorthand("0.2 0.8"),
        createShorthand("<400 800>"),
      ).getSchema();

      expect(direct.outputA).toEqual({
        type: "static",
        cycle: [[0.2, 0.8]],
      });
      expect(direct.outputB).toEqual({
        type: "static",
        cycle: [[400], [800]],
      });
      expect(reusable.outputA).toEqual(direct.outputA);
      expect(reusable.outputB).toEqual(direct.outputB);
    } finally {
      warn.mockRestore();
    }
  });

  it("warns once per affected endpoint after repeated serialization", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const lfo = new Lfo("0.2 0.8", "<400 [800 1200]>");

    expect(warn).not.toHaveBeenCalled();
    const firstSchema = lfo.getSchema();
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls).toEqual([
      [
        "[LFO] outputA bars contain multiple values; only the first value of each bar is used.",
      ],
      [
        "[LFO] outputB bars contain multiple values; only the first value of each bar is used.",
      ],
    ]);
    expect(firstSchema.outputA).toEqual({
      type: "static",
      cycle: [[0.2, 0.8]],
    });
    expect(firstSchema.outputB).toEqual({
      type: "static",
      cycle: [[400], [800, 1200]],
    });

    expect(lfo.getSchema()).toEqual(firstSchema);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("warns for structured multivalue endpoints only during serialization", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const d = new Drome();
    const lfo = d.lfo(d.str([0.2, 0.8], 0.4), d.str(400, [800, 1_200]));
    expect(warn).not.toHaveBeenCalled();

    const first = lfo.getSchema();
    expect(first.outputA).toEqual({
      type: "static",
      cycle: [[0.2, 0.8], [0.4]],
    });
    expect(first.outputB).toEqual({
      type: "static",
      cycle: [[400], [800, 1_200]],
    });
    expect(warn.mock.calls).toEqual([
      [
        "[LFO] outputA bars contain multiple values; only the first value of each bar is used.",
      ],
      [
        "[LFO] outputB bars contain multiple values; only the first value of each bar is used.",
      ],
    ]);
    expect(lfo.getSchema()).toEqual(first);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("does not warn for scalar, single-value bars, or random endpoints", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const scalar = new Lfo(600, 400).getSchema();
    expect(scalar.outputA).toEqual({
      type: "static",
      cycle: [[600]],
    });
    expect(scalar.outputB).toEqual({
      type: "static",
      cycle: [[400]],
    });

    const shorthand = new Lfo(
      "<600 800>",
      createShorthand("<400 500>"),
    ).getSchema();
    expect(shorthand.outputA).toEqual({
      type: "static",
      cycle: [[600], [800]],
    });
    expect(shorthand.outputB).toEqual({
      type: "static",
      cycle: [[400], [500]],
    });

    const random = new RandomCycle().steps(2, 4);
    const structuredAndRandom = new Lfo(
      createStructuredInput(600, 800),
      random,
    ).getSchema();
    expect(structuredAndRandom.outputA).toEqual({
      type: "static",
      cycle: [[600], [800]],
    });
    expect(structuredAndRandom.outputB).toMatchObject({
      type: "random-number",
      valuesPerBar: [2, 4],
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("rejects invalid, raw-array, and mixed endpoint inputs before construction", () => {
    expect(() => Reflect.construct(Lfo, [[600, 800], 1])).toThrow(
      "[LFO] outputA",
    );
    expect(() => new Lfo("0.2 ~ 0.8", 1)).toThrow("[LFO] outputA");
    expect(() => new Lfo("NaN", 1)).toThrow("[LFO] outputA");
    expect(() => new Lfo("<1!1025>", 1)).toThrow("[LFO] outputA");
    expect(() => Reflect.construct(Lfo, [["0.2", 0.8], 1])).toThrow(
      "[LFO] outputA",
    );

    expect(() => new Lfo(1, "0.2 ~ 0.8")).toThrow("[LFO] outputB");
    expect(() => new Lfo(1, "NaN")).toThrow("[LFO] outputB");
    expect(() => new Lfo(1, "<1!1025>")).toThrow("[LFO] outputB");
  });

  it("rejects every invalid endpoint shape at constructor and factory boundaries", () => {
    const d = new Drome();
    const invalid: unknown[] = [
      undefined,
      null,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      true,
      {},
      [0.2, 0.4],
      [[0.2, 0.4]],
      d.env(),
      d.lfo(0, 1),
      d.midi.cc(74),
      new Parameter(1),
      "0.2 ~ 0.8",
      "",
      d.str("0.2"),
      d.str(null),
      d.str([[0.2, 0.4]]),
      d.str([]),
    ];

    for (const value of invalid) {
      expect(() => Reflect.construct(Lfo, [value, 1])).toThrow("[LFO] outputA");
      expect(() => Reflect.construct(Lfo, [1, value])).toThrow("[LFO] outputB");
      expect(() => Reflect.apply(d.lfo, d, [value, 1])).toThrow(
        "[LFO] outputA",
      );
      expect(() => Reflect.apply(d.lfo, d, [1, value])).toThrow(
        "[LFO] outputB",
      );
    }
  });

  it("keeps endpoint type permissions explicit", () => {
    const d = new Drome();
    const random = d.rand();
    const valid = () => {
      expectTypeOf(new Lfo(1, "0.2")).toMatchTypeOf<Lfo>();
      expectTypeOf(new Lfo(d.sh("0.2"), d.str(1))).toMatchTypeOf<Lfo>();
      expectTypeOf(new Lfo(random, 1)).toMatchTypeOf<Lfo>();
      expectTypeOf(d.lfo(1, d.sh("0.2"))).toMatchTypeOf<Lfo>();
    };
    expectTypeOf(valid).toBeFunction();

    const invalid = () => {
      // @ts-expect-error LFO endpoints reject raw arrays.
      new Lfo([0.2, 0.4], 1);
      // @ts-expect-error LFO endpoints reject arbitrary values.
      new Lfo(true, 1);
      // @ts-expect-error LFO endpoints require both values.
      new Lfo(1);
      // @ts-expect-error LFO endpoints reject extra values.
      new Lfo(1, 2, 3);
      // @ts-expect-error The factory rejects raw arrays.
      d.lfo([0.2, 0.4], 1);
      // @ts-expect-error The factory rejects arbitrary values.
      d.lfo({}, 1);
      // @ts-expect-error The factory requires both values.
      d.lfo(1);
      // @ts-expect-error The factory rejects extra values.
      d.lfo(1, 2, 3);
    };
    expectTypeOf(invalid).toBeFunction();
  });

  it(".speed() sets speed array", () => {
    const schema = new Lfo(800, 400).speed(2, 1).getSchema();
    expect(schema.speed).toEqual([2, 1]);
  });

  it(".wave() sets waveform array", () => {
    const schema = new Lfo(800, 400).wave("sawtooth", "triangle").getSchema();
    expect(schema.waveform).toEqual(["sawtooth", "triangle"]);
  });

  it(".offset() sets phase", () => {
    const schema = new Lfo(800, 400).offset(0.5).getSchema();
    expect(schema.phase).toBe(0.5);
  });

  it(".norm() sets norm to true", () => {
    const schema = new Lfo(400, 800).norm().getSchema();
    expect(schema.norm).toBe(true);
  });

  it("supports full method chaining", () => {
    const schema = new Lfo(400, 800)
      .speed(0.5)
      .wave("sawtooth")
      .norm()
      .offset(0.25)
      .getSchema();

    expect(schema.speed).toEqual([0.5]);
    expect(schema.waveform).toEqual(["sawtooth"]);
    expect(schema.norm).toBe(true);
    expect(schema.phase).toBe(0.25);
  });
});
