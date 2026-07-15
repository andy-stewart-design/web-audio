import { describe, expect, test, vi } from "vitest";
import { MidiInputs } from "./inputs.js";
import type { WebMidiMessageEvent } from "./types.js";

class FakeInput {
  state: "connected" | "disconnected" = "connected";
  private _listeners = new Set<(event: WebMidiMessageEvent) => void>();

  constructor(
    readonly id: string,
    readonly name: string | null,
  ) {}

  addEventListener(
    _type: "midimessage",
    listener: (event: WebMidiMessageEvent) => void,
  ) {
    this._listeners.add(listener);
  }

  removeEventListener(
    _type: "midimessage",
    listener: (event: WebMidiMessageEvent) => void,
  ) {
    this._listeners.delete(listener);
  }

  send(...data: number[]) {
    const event = Object.assign(new Event("midimessage"), {
      data: Uint8Array.from(data),
    });
    this._listeners.forEach((listener) => listener(event));
  }
}

const heldNotes = (signal: ReturnType<MidiInputs["notes"]>) =>
  Array.from(signal.value);

describe("MidiInputs signal identity", () => {
  test("returns canonical CC signals for each selector, number, and channel", () => {
    const inputs = new MidiInputs();

    expect(inputs.cc(74)).toBe(inputs.cc(74));
    expect(inputs.cc("device", 74)).toBe(inputs.cc("device", 74));
    expect(inputs.cc("device", 74)).not.toBe(inputs.cc("other", 74));
    expect(inputs.cc(74).channel(1)).toBe(inputs.cc(74).channel(1));
    expect(inputs.cc(74).channel(1)).not.toBe(inputs.cc(74).channel(2));
  });

  test("channel scoping is immutable", () => {
    const inputs = new MidiInputs();
    const unscoped = inputs.cc(74);
    const scoped = unscoped.channel(1);

    expect(scoped).not.toBe(unscoped);
    expect(inputs.cc(74)).toBe(unscoped);
    expect(unscoped.receivedChannel).toBeNull();
  });

  test("returns canonical note signals", () => {
    const inputs = new MidiInputs();

    expect(inputs.notes()).toBe(inputs.notes());
    expect(inputs.notes("device")).toBe(inputs.notes("device"));
    expect(inputs.notes().channel(1)).toBe(inputs.notes().channel(1));
    expect(inputs.notes().channel(1)).not.toBe(inputs.notes());
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

describe("MIDI CC input", () => {
  test("decodes values and records source metadata", () => {
    const inputs = new MidiInputs();
    const port = new FakeInput("keys-id", "Keys");
    const signal = inputs.cc(74);
    const subscriber = vi.fn();
    signal.subscribe(subscriber);
    inputs._setPorts([port]);

    port.send(0xb2, 74, 127);

    expect(signal.value).toBe(1);
    expect(signal.raw).toBe(127);
    expect(signal.hasValue).toBe(true);
    expect(signal.deviceId).toBe("keys-id");
    expect(signal.receivedChannel).toBe(3);
    expect(subscriber).toHaveBeenLastCalledWith(1);
  });

  test("filters by CC, channel, exact ID, and exact name", () => {
    const inputs = new MidiInputs();
    const keys = new FakeInput("keys-id", "Keys");
    const drums = new FakeInput("drums-id", "Drums");
    const byId = inputs.cc("keys-id", 74).channel(2);
    const byName = inputs.cc("Keys", 74);
    inputs._setPorts([keys, drums]);

    keys.send(0xb0, 74, 10);
    keys.send(0xb1, 1, 20);
    drums.send(0xb1, 74, 30);
    expect(byId.hasValue).toBe(false);

    keys.send(0xb1, 74, 64);
    expect(byId.raw).toBe(64);
    expect(byName.raw).toBe(64);
  });

  test("prefers an exact ID and selects the first duplicate name", () => {
    const inputs = new MidiInputs();
    const first = new FakeInput("first", "Shared");
    const exactId = new FakeInput("Shared", "Other");
    const duplicate = new FakeInput("duplicate", "Shared");
    const selector = inputs.cc("Shared", 1);
    const duplicateName = inputs.cc("Duplicate", 2);
    const namedFirst = new FakeInput("named-first", "Duplicate");
    const namedSecond = new FakeInput("named-second", "Duplicate");
    inputs._setPorts([first, exactId, duplicate, namedFirst, namedSecond]);

    first.send(0xb0, 1, 10);
    exactId.send(0xb0, 1, 20);
    duplicate.send(0xb0, 1, 30);
    namedSecond.send(0xb0, 2, 40);
    namedFirst.send(0xb0, 2, 50);

    expect(selector.raw).toBe(20);
    expect(selector.deviceId).toBe("Shared");
    expect(duplicateName.raw).toBe(50);
    expect(duplicateName.deviceId).toBe("named-first");
  });

  test("retains the latest CC state on disconnect", () => {
    const inputs = new MidiInputs();
    const port = new FakeInput("keys-id", "Keys");
    const signal = inputs.cc(7);
    inputs._setPorts([port]);
    port.send(0xb0, 7, 50);

    inputs._setPorts([]);

    expect(signal.raw).toBe(50);
    expect(signal.hasValue).toBe(true);
    expect(signal.deviceId).toBe("keys-id");
  });
});

describe("MIDI note input", () => {
  test("tracks notes by device, channel, and pitch", () => {
    const inputs = new MidiInputs();
    const first = new FakeInput("first", "First");
    const second = new FakeInput("second", "Second");
    const signal = inputs.notes();
    inputs._setPorts([first, second]);

    first.send(0x90, 60, 100);
    first.send(0x91, 60, 90);
    second.send(0x90, 60, 80);

    expect(heldNotes(signal)).toEqual([
      { note: 60, velocity: 100, deviceId: "first", channel: 1 },
      { note: 60, velocity: 90, deviceId: "first", channel: 2 },
      { note: 60, velocity: 80, deviceId: "second", channel: 1 },
    ]);
  });

  test("handles note-off and velocity-zero note-on", () => {
    const inputs = new MidiInputs();
    const port = new FakeInput("keys-id", "Keys");
    const signal = inputs.notes();
    inputs._setPorts([port]);

    port.send(0x90, 60, 100);
    port.send(0x90, 61, 100);
    port.send(0x80, 60, 64);
    port.send(0x90, 61, 0);

    expect(heldNotes(signal)).toEqual([]);
  });

  test("updates velocity and emits a fresh snapshot for repeated note-on", () => {
    const inputs = new MidiInputs();
    const port = new FakeInput("keys-id", "Keys");
    const signal = inputs.notes();
    const snapshots: ReadonlySet<unknown>[] = [];
    signal.subscribe((value) => snapshots.push(value));
    inputs._setPorts([port]);

    port.send(0x90, 60, 40);
    const first = signal.value;
    port.send(0x90, 60, 90);

    expect(heldNotes(signal)).toEqual([
      { note: 60, velocity: 90, deviceId: "keys-id", channel: 1 },
    ]);
    expect(signal.value).not.toBe(first);
    expect(snapshots).toHaveLength(3);
  });

  test("filters notes by device and channel", () => {
    const inputs = new MidiInputs();
    const keys = new FakeInput("keys-id", "Keys");
    const drums = new FakeInput("drums-id", "Drums");
    const signal = inputs.notes("Keys").channel(2);
    inputs._setPorts([keys, drums]);

    keys.send(0x90, 60, 100);
    drums.send(0x91, 61, 100);
    keys.send(0x91, 62, 100);

    expect(heldNotes(signal)).toEqual([
      { note: 62, velocity: 100, deviceId: "keys-id", channel: 2 },
    ]);
  });

  test("removes disconnected-device notes while retaining other devices", () => {
    const inputs = new MidiInputs();
    const first = new FakeInput("first", "First");
    const second = new FakeInput("second", "Second");
    const signal = inputs.notes();
    inputs._setPorts([first, second]);
    first.send(0x90, 60, 100);
    second.send(0x90, 60, 80);

    inputs._setPorts([second]);

    expect(heldNotes(signal)).toEqual([
      { note: 60, velocity: 80, deviceId: "second", channel: 1 },
    ]);
  });

  test("ignores unsupported and incomplete messages", () => {
    const inputs = new MidiInputs();
    const port = new FakeInput("keys-id", "Keys");
    const notes = inputs.notes();
    const cc = inputs.cc(1);
    inputs._setPorts([port]);

    port.send(0xc0, 1, 2);
    port.send(0x90, 60);

    expect(heldNotes(notes)).toEqual([]);
    expect(cc.hasValue).toBe(false);
  });
});
