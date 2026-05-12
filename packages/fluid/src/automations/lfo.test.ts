import { RandomCycle } from "@web-audio/patterns";
import { describe, expect, it } from "vitest";
import Lfo from "./lfo";

describe("Lfo", () => {
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

  it("serializes static outputA and outputB", () => {
    const schema = new Lfo(800, 400).getSchema();
    expect(schema.outputA.type).toBe("static");
    expect(schema.outputB.type).toBe("static");
  });

  it("supports array cycling on outputA", () => {
    const schema = new Lfo([600, 800], 400).getSchema();
    expect(schema.outputA.type).toBe("static");
    if (schema.outputA.type === "static") {
      expect(schema.outputA.cycle).toHaveLength(2);
    }
  });

  it("supports RandomCycle on outputB", () => {
    const rand = new RandomCycle();
    const schema = new Lfo(800, rand).getSchema();
    expect(schema.outputB.type).toBe("random");
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
