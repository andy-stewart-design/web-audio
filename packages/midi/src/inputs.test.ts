import { describe, expect, test } from "vitest";
import { MidiInputs } from "./inputs.js";

describe("MidiInputs signal identity", () => {
  test("returns canonical CC signals for each selector, number, and channel", () => {
    const input = new MidiInputs();

    expect(input.cc(74)).toBe(input.cc(74));
    expect(input.cc("device", 74)).toBe(input.cc("device", 74));
    expect(input.cc("device", 74)).not.toBe(input.cc("other", 74));
    expect(input.cc(74).channel(1)).toBe(input.cc(74).channel(1));
    expect(input.cc(74).channel(1)).not.toBe(input.cc(74).channel(2));
  });

  test("channel scoping is immutable", () => {
    const input = new MidiInputs();
    const unscoped = input.cc(74);
    const scoped = unscoped.channel(1);

    expect(scoped).not.toBe(unscoped);
    expect(input.cc(74)).toBe(unscoped);
    expect(unscoped.receivedChannel).toBeNull();
  });

  test("returns canonical note signals", () => {
    const input = new MidiInputs();

    expect(input.notes()).toBe(input.notes());
    expect(input.notes("device")).toBe(input.notes("device"));
    expect(input.notes().channel(1)).toBe(input.notes().channel(1));
    expect(input.notes().channel(1)).not.toBe(input.notes());
  });

  test("CC signals expose their specified initial state", () => {
    const signal = new MidiInputs().cc(74);

    expect(signal.value).toBe(0);
    expect(signal.raw).toBe(0);
    expect(signal.hasValue).toBe(false);
    expect(signal.deviceId).toBeNull();
    expect(signal.receivedChannel).toBeNull();
  });
});
