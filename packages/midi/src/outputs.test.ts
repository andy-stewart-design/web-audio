import { describe, expect, test } from "vitest";
import { createMidiOutputs } from "./outputs.js";

class FakeOutput {
  readonly id: string;
  readonly name: string | null;
  readonly sends: { data: number[]; time: number | undefined }[] = [];
  state: "connected" | "disconnected" = "connected";
  clearCount = 0;
  throwOnSend = false;
  throwOnClear = false;

  constructor(id: string, name: string | null) {
    this.id = id;
    this.name = name;
  }

  send(data: Uint8Array | readonly number[], time?: number) {
    if (this.throwOnSend) throw new Error("send failed");
    this.sends.push({ data: Array.from(data), time });
  }

  clear() {
    if (this.throwOnClear) throw new Error("clear failed");
    this.clearCount++;
  }
}

const setup = (...ports: FakeOutput[]) => {
  const manager = createMidiOutputs();
  manager.setPorts(ports);
  return { manager, outputs: manager.outputs };
};

describe("typed MIDI output", () => {
  test("encodes note and CC messages with public channels 1-16", () => {
    const port = new FakeOutput("synth-id", "Synth");
    const { outputs } = setup(port);

    expect(
      outputs.noteOn("synth-id", {
        note: 60,
        velocity: 100,
        channel: 1,
        time: 123,
      }),
    ).toEqual({ sent: true });
    outputs.noteOff("synth-id", { note: 60, channel: 1, time: 456 });
    outputs.cc("synth-id", { cc: 74, value: 127, channel: 1 });
    outputs.noteOn("synth-id", { note: 61, velocity: 1, channel: 16 });
    outputs.noteOn("synth-id", { note: 62 });
    outputs.noteOff("synth-id", { note: 62 });
    outputs.cc("synth-id", { cc: 1, value: 2 });

    expect(port.sends).toEqual([
      { data: [0x90, 60, 100], time: 123 },
      { data: [0x80, 60, 0], time: 456 },
      { data: [0xb0, 74, 127], time: undefined },
      { data: [0x9f, 61, 1], time: undefined },
      { data: [0x90, 62, 127], time: undefined },
      { data: [0x80, 62, 0], time: undefined },
      { data: [0xb0, 1, 2], time: undefined },
    ]);
  });

  test.each([
    [
      "note",
      () => setup().outputs.noteOn("x", { note: -1, velocity: 1, channel: 1 }),
    ],
    [
      "velocity",
      () => setup().outputs.noteOn("x", { note: 1, velocity: 128, channel: 1 }),
    ],
    ["CC", () => setup().outputs.cc("x", { cc: 1.5, value: 1, channel: 1 })],
    [
      "CC value",
      () => setup().outputs.cc("x", { cc: 1, value: NaN, channel: 1 }),
    ],
    ["channel", () => setup().outputs.noteOff("x", { note: 1, channel: 0 })],
    [
      "time",
      () =>
        setup().outputs.noteOff("x", { note: 1, channel: 1, time: Infinity }),
    ],
  ])("rejects invalid %s values", (_name, send) => {
    expect(send).toThrow();
  });
});

const invalidRawData = [
  { data: [] },
  { data: [-1] },
  { data: [256] },
  { data: [1.5] },
  { data: [0xf0, 1] },
  { data: [1, 0xf7] },
];

describe("raw MIDI output", () => {
  test("sends Uint8Array and readonly byte arrays without framing validation", () => {
    const port = new FakeOutput("synth-id", "Synth");
    const { outputs } = setup(port);
    const realtime = [0xf8] as const;

    outputs.send("synth-id", Uint8Array.of(0xc0, 10), 20);
    outputs.send("synth-id", realtime);

    expect(port.sends).toEqual([
      { data: [0xc0, 10], time: 20 },
      { data: [0xf8], time: undefined },
    ]);
  });

  test.each(invalidRawData)("rejects invalid raw bytes $data", ({ data }) => {
    expect(() => setup().outputs.send("x", data)).toThrow();
  });

  test("rejects unsupported raw input types at runtime", () => {
    const send = setup().outputs.send;
    expect(() => Reflect.apply(send, undefined, ["x", "not bytes"])).toThrow(
      "Uint8Array or readonly byte array",
    );
  });
});

describe("MIDI output resolution and lifecycle", () => {
  test("resolves exact IDs before names and picks the first duplicate name", () => {
    const named = new FakeOutput("first", "Shared");
    const exactId = new FakeOutput("Shared", "Other");
    const duplicate = new FakeOutput("duplicate", "Shared");
    const { outputs } = setup(named, exactId, duplicate);

    expect(outputs.resolve()?.id).toBe("first");
    expect(outputs.resolve("Shared")?.id).toBe("Shared");
    expect(outputs.resolve("Other")?.id).toBe("Shared");
    expect(outputs.resolve("missing")).toBeNull();
  });

  test("retains a concrete output handle across port-list changes", () => {
    const original = new FakeOutput("original", "Original");
    const replacement = new FakeOutput("replacement", "Replacement");
    const manager = createMidiOutputs();
    manager.setPorts([original]);
    const handle = manager.outputs.resolve();
    expect(handle).not.toBeNull();

    manager.setPorts([replacement, original]);
    manager.outputs.noteOn(handle!, { note: 60, velocity: 100, channel: 1 });

    expect(original.sends).toHaveLength(1);
    expect(replacement.sends).toHaveLength(0);
  });

  test("reports unavailable targets and native send failures", () => {
    const port = new FakeOutput("synth-id", "Synth");
    const { outputs } = setup(port);

    expect(
      outputs.noteOn("missing", { note: 60, velocity: 100, channel: 1 }),
    ).toEqual({ sent: false, reason: "unavailable" });

    port.throwOnSend = true;
    expect(
      outputs.noteOn("synth-id", { note: 60, velocity: 100, channel: 1 }),
    ).toEqual({ sent: false, reason: "send-error" });
  });

  test("clears concrete output queues without exposing native ports", () => {
    const port = new FakeOutput("synth-id", "Synth");
    const { outputs } = setup(port);
    const handle = outputs.resolve("synth-id");
    expect(handle).not.toBeNull();

    outputs.clear(handle!);
    port.throwOnClear = true;
    expect(() => outputs.clear(handle!)).not.toThrow();

    expect(port.clearCount).toBe(1);
  });

  test("returns destroyed failures after validating programmer input", () => {
    const port = new FakeOutput("synth-id", "Synth");
    const { manager, outputs } = setup(port);
    manager.destroy();

    expect(outputs.resolve()).toBeNull();
    expect(
      outputs.noteOn("synth-id", { note: 60, velocity: 100, channel: 1 }),
    ).toEqual({ sent: false, reason: "destroyed" });
    expect(() =>
      outputs.noteOn("synth-id", { note: -1, velocity: 100, channel: 1 }),
    ).toThrow();
  });
});
