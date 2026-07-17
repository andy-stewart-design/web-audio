import { describe, expect, test } from "vitest";
import Drome from "./index";

const context = {
  range: { min: 0, max: 1, curve: "linear" as const },
  default: 0.5,
};

describe("MIDI output builder", () => {
  test("defaults to channel 1", () => {
    expect(new Drome().midi.out().getSchema()).toEqual({
      type: "midi-out",
      channel: 1,
    });
  });

  test("serializes a device selector and channel", () => {
    expect(
      new Drome().midi.out("Launchkey Mini").channel(10).getSchema(),
    ).toEqual({
      type: "midi-out",
      device: "Launchkey Mini",
      channel: 10,
    });
  });

  test.each([0, 17, 1.5, NaN])("rejects invalid channel %s", (channel) => {
    expect(() => new Drome().midi.out().channel(channel)).toThrow();
  });
});

describe("MIDI CC builder", () => {
  test("serializes unscoped and device/channel-scoped CCs", () => {
    expect(new Drome().midi.cc(74).getSchema(context)).toEqual({
      type: "midi-cc",
      cc: 74,
      range: context.range,
      default: 0.5,
    });
    expect(
      new Drome().midi.cc("Launchkey Mini", 74).channel(1).getSchema(context),
    ).toEqual({
      type: "midi-cc",
      cc: 74,
      device: "Launchkey Mini",
      channel: 1,
      range: context.range,
      default: 0.5,
    });
  });

  test("supports explicit linear and exponential ranges", () => {
    expect(new Drome().midi.cc(74).range(0, 10).default(4).getSchema()).toEqual(
      {
        type: "midi-cc",
        cc: 74,
        range: { min: 0, max: 10, curve: "linear" },
        default: 4,
      },
    );
    expect(
      new Drome().midi.cc(74).expRange(20, 20_000).default(440).getSchema(),
    ).toEqual({
      type: "midi-cc",
      cc: 74,
      range: { min: 20, max: 20_000, curve: "exponential" },
      default: 440,
    });
  });

  test("supports reversed and equal ranges", () => {
    expect(
      new Drome().midi.cc(1).range(10, 0).default(7).getSchema().range,
    ).toEqual({ min: 10, max: 0, curve: "linear" });
    expect(
      new Drome().midi.cc(1).expRange(1000, 20).default(440).getSchema().range,
    ).toEqual({ min: 1000, max: 20, curve: "exponential" });
    expect(
      new Drome().midi.cc(1).range(2, 2).default(9).getSchema(),
    ).toMatchObject({
      range: { min: 2, max: 2, curve: "linear" },
      default: 2,
    });
  });

  test("clamps explicit defaults to either range direction", () => {
    expect(
      new Drome().midi.cc(1).range(0, 1).default(2).getSchema().default,
    ).toBe(1);
    expect(
      new Drome().midi.cc(1).range(1, 0).default(-1).getSchema().default,
    ).toBe(0);
  });

  test("explicit values override contextual values", () => {
    expect(
      new Drome().midi.cc(1).range(10, 20).default(15).getSchema(context),
    ).toMatchObject({
      range: { min: 10, max: 20, curve: "linear" },
      default: 15,
    });
  });

  test("range and default call ordering produces identical schemas", () => {
    const rangeFirst = new Drome().midi
      .cc(74)
      .range(0, 1)
      .default(2)
      .getSchema();
    const defaultFirst = new Drome().midi
      .cc(74)
      .default(2)
      .range(0, 1)
      .getSchema();
    const expRangeFirst = new Drome().midi
      .cc(74)
      .expRange(20, 20_000)
      .default(440)
      .getSchema();
    const expDefaultFirst = new Drome().midi
      .cc(74)
      .default(440)
      .expRange(20, 20_000)
      .getSchema();

    expect(defaultFirst).toEqual(rangeFirst);
    expect(expDefaultFirst).toEqual(expRangeFirst);
  });

  test.each([-1, 128, 1.5, NaN])("rejects invalid CC number %s", (cc) => {
    expect(() => new Drome().midi.cc(cc)).toThrow();
  });

  test.each([0, 17, 1.5, NaN])("rejects invalid channel %s", (channel) => {
    expect(() => new Drome().midi.cc(1).channel(channel)).toThrow();
  });

  test.each([NaN, Infinity, -Infinity])(
    "rejects non-finite range values %s",
    (value) => {
      expect(() => new Drome().midi.cc(1).range(value, 1)).toThrow();
      expect(() => new Drome().midi.cc(1).range(0, value)).toThrow();
      expect(() => new Drome().midi.cc(1).default(value)).toThrow();
    },
  );

  test.each([
    [0, 1],
    [-1, 1],
    [1, 0],
    [1, -1],
  ])("rejects non-positive exponential range (%s, %s)", (min, max) => {
    expect(() => new Drome().midi.cc(1).expRange(min, max)).toThrow(
      "must be positive",
    );
  });

  test("requires missing range/default values to come from context", () => {
    expect(() => new Drome().midi.cc(1).getSchema()).toThrow(
      "requires a range and default",
    );
    expect(() => new Drome().midi.cc(1).range(0, 1).getSchema()).toThrow(
      "requires a range and default",
    );
  });
});
