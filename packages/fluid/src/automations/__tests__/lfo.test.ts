import { createShorthand, RandomCycle } from "@web-audio/patterns";
import { afterEach, describe, expect, it, vi } from "vitest";
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

  it("serializes static outputA and outputB as raw values", () => {
    const schema = new Lfo(800, 400).getSchema();
    expect(schema.outputA).toEqual({ type: "static", cycle: [[800]] });
    expect(schema.outputB).toEqual({ type: "static", cycle: [[400]] });
  });

  it("interprets endpoint arrays as separate bars for both outputs", () => {
    const outputA = [600, 800];
    const outputB = [400, 500];
    const lfo = new Lfo(outputA, outputB);
    outputA[0] = 1000;
    outputB[1] = 1200;

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

  it("does not warn for scalar, single-value shorthand bars, arrays, or random endpoints", () => {
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
    const arraysAndRandom = new Lfo([600, 800], random).getSchema();
    expect(arraysAndRandom.outputA).toEqual({
      type: "static",
      cycle: [[600], [800]],
    });
    expect(arraysAndRandom.outputB).toMatchObject({
      type: "random-number",
      valuesPerBar: [2, 4],
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("rejects invalid, over-limit, and mixed endpoint inputs before construction", () => {
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
