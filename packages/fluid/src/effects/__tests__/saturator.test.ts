import { RandomCycle } from "@web-audio/patterns";
import { describe, expect, it } from "vitest";
import Drome from "@/drome";
import Envelope from "@/automations/envelope";
import Saturator from "../saturator";

const schemaValue = (value: number) => ({
  type: "static" as const,
  cycle: [[value]],
});

describe("Saturator", () => {
  it("serializes default and signed drive/postgain values", () => {
    expect(new Saturator().getSchema()).toEqual({
      type: "saturator",
      drive: schemaValue(1),
      postgain: schemaValue(1),
    });
    expect(new Saturator(-2).postgain(-0.5).getSchema()).toEqual({
      type: "saturator",
      drive: schemaValue(-2),
      postgain: schemaValue(-0.5),
    });
  });

  it("accepts reusable sources without mutating them", () => {
    const drome = new Drome();
    const envelope = new Envelope(-1, 2);
    const random = new RandomCycle().steps(2).range(-2, 2);
    const saturator = new Saturator(envelope).postgain(random);

    expect(saturator.getSchema()).toMatchObject({
      drive: { type: "envelope" },
      postgain: { type: "random-number", valuesPerBar: [2] },
    });
    expect(drome.env(-1, 2).getSchema()).toEqual(envelope.getSchema());
    expect(random.getRandomSchema()).toMatchObject({ valuesPerBar: [2] });
  });

  it("replaces postgain instead of accumulating stages", () => {
    const saturator = new Saturator(0).postgain(2).postgain(-3);

    expect(saturator.getSchema().postgain).toEqual(schemaValue(-3));
  });

  it("rejects missing postgain, extra drive arguments, and raw arrays", () => {
    const drome = new Drome();
    expect(() => Reflect.construct(Saturator, [1, 2])).toThrow(
      "one drive value",
    );
    expect(() => Reflect.apply(drome.saturator, drome, [1, 2])).toThrow(
      "one drive value",
    );
    expect(() => new Saturator([1, 2] as never)).toThrow();
    expect(() => Reflect.apply(drome.saturator, drome, [[1, 2]])).toThrow();
    expect(drome.saturator(undefined).getSchema().drive).toEqual(
      schemaValue(1),
    );
    expect(() => new Saturator().postgain()).toThrow("requires one value");
  });

  it("accepts direct automation builders for both controls", () => {
    const drome = new Drome();
    const saturator = drome
      .saturator(drome.lfo(-1, 2))
      .postgain(drome.midi.cc(74).range(-1, 1).default(0));

    expect(saturator.getSchema()).toMatchObject({
      type: "saturator",
      drive: { type: "lfo" },
      postgain: { type: "midi-cc" },
    });
  });

  it("attaches through synth, sampler, and named-bus public unions", () => {
    const drome = new Drome();
    drome.synth().fx(drome.saturator()).push();
    drome.sample("bd").fx(drome.saturator(0)).push();
    drome.bus("drums").fx(drome.saturator(-1));

    const schema = drome.getSchema();
    expect(
      schema.instruments.map((instrument) => instrument.effects[0]),
    ).toEqual([
      { type: "saturator", drive: schemaValue(1), postgain: schemaValue(1) },
      { type: "saturator", drive: schemaValue(0), postgain: schemaValue(1) },
    ]);
    expect(schema.buses.drums.effects).toEqual([
      { type: "saturator", drive: schemaValue(-1), postgain: schemaValue(1) },
    ]);
  });
});
