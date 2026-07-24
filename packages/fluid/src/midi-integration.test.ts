import { describe, expect, test, vi } from "vitest";
import Drome from "./index";

describe("instrument MIDI output", () => {
  test("serializes synth output with channel and device defaults", () => {
    const d = new Drome();

    expect(d.synth().out(d.midi.out()).getSchema().notesOut).toEqual({
      type: "midi-out",
      channel: 1,
    });
    expect(
      d.synth().out(d.midi.out("hardware-id").channel(10)).getSchema().notesOut,
    ).toEqual({
      type: "midi-out",
      device: "hardware-id",
      channel: 10,
    });
  });

  test("replaces an earlier synth output", () => {
    const d = new Drome();
    const schema = d
      .synth()
      .out(d.midi.out("first"))
      .out(d.midi.out("second").channel(2))
      .getSchema();

    expect(schema.notesOut).toEqual({
      type: "midi-out",
      device: "second",
      channel: 2,
    });
  });

  test("does not expose MIDI output on samplers", () => {
    expect("out" in new Drome().sample("bd")).toBe(false);
  });
});

describe("instrument mute", () => {
  test("defaults to false and serializes for synths and samplers", () => {
    const d = new Drome();

    expect(d.synth().getSchema().muted).toBe(false);
    expect(d.sample("bd").getSchema().muted).toBe(false);
    expect(d.synth().mute().getSchema().muted).toBe(true);
    expect(d.sample("bd").mute().getSchema().muted).toBe(true);
  });

  test("supports explicit false and repeated replacement", () => {
    const d = new Drome();

    expect(d.synth().mute().mute(false).getSchema().muted).toBe(false);
    expect(d.sample("bd").mute(true).mute(false).getSchema().muted).toBe(false);
  });
});

describe("contextual MIDI CC serialization", () => {
  test("applies the instrument detune context", () => {
    const d = new Drome();

    expect(d.synth().detune(d.midi.cc(1)).getSchema().detune).toEqual({
      type: "midi-cc",
      cc: 1,
      range: { min: -1200, max: 1200, curve: "linear" },
      default: 0,
    });
  });

  test("applies every filter parameter context", () => {
    const d = new Drome();
    const schema = d
      .lpf(d.midi.cc(74))
      .q(d.midi.cc(71))
      .detune(d.midi.cc(72))
      .gain(d.midi.cc(73))
      .getSchema();

    expect(schema.frequency).toMatchObject({
      type: "midi-cc",
      range: { min: 20, max: 20_000, curve: "exponential" },
      default: 1_000,
    });
    expect(schema.q).toMatchObject({
      type: "midi-cc",
      range: { min: 0, max: 30, curve: "linear" },
      default: 1,
    });
    expect(schema.detune).toMatchObject({
      type: "midi-cc",
      range: { min: -1_200, max: 1_200, curve: "linear" },
      default: 0,
    });
    expect(schema.gain).toMatchObject({
      type: "midi-cc",
      range: { min: -24, max: 24, curve: "linear" },
      default: 0,
    });
  });

  test("applies the gain-effect context", () => {
    const d = new Drome();
    const schema = d.gain(d.midi.cc(7)).getSchema();

    expect(schema.gain).toEqual({
      type: "midi-cc",
      cc: 7,
      range: { min: 0, max: 1, curve: "linear" },
      default: 1,
    });
  });

  test("preserves device and channel scopes", () => {
    const d = new Drome();
    const schema = d.lpf(d.midi.cc("controller-id", 74).channel(3)).getSchema();

    expect(schema.frequency).toMatchObject({
      device: "controller-id",
      channel: 3,
    });
  });

  test("explicit configuration overrides contextual values", () => {
    const d = new Drome();
    const control = d.midi.cc(74).range(100, 8_000).default(440);

    expect(d.lpf(control).getSchema().frequency).toMatchObject({
      range: { min: 100, max: 8_000, curve: "linear" },
      default: 440,
    });
  });

  test("serialization is deterministic and emits no MIDI warnings", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const first = new Drome().lpf(new Drome().midi.cc(74)).getSchema();
    const d = new Drome();
    const second = d.lpf(d.midi.cc(74)).getSchema();

    expect(second).toEqual(first);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
