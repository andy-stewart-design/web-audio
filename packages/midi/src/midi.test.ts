import { afterEach, describe, expect, test, vi } from "vitest";
import { Midi, MidiDestroyedError } from "./midi.js";

class FakeInput {
  state: "connected" | "disconnected" = "connected";
  readonly listeners = new Set<(event: Event) => void>();

  constructor(
    readonly id: string,
    readonly name: string | null,
  ) {}

  addEventListener(_type: "midimessage", listener: (event: Event) => void) {
    this.listeners.add(listener);
  }

  removeEventListener(_type: "midimessage", listener: (event: Event) => void) {
    this.listeners.delete(listener);
  }
}

class FakeOutput {
  state: "connected" | "disconnected" = "connected";

  constructor(
    readonly id: string,
    readonly name: string | null,
  ) {}
}

class FakePortMap<T extends FakeInput | FakeOutput> {
  constructor(readonly ports: T[]) {}

  values() {
    return this.ports.values();
  }
}

class FakeAccess {
  readonly inputs: FakePortMap<FakeInput>;
  readonly outputs: FakePortMap<FakeOutput>;
  onstatechange: ((event: Event) => void) | null = null;

  constructor(inputs: FakeInput[] = [], outputs: FakeOutput[] = []) {
    this.inputs = new FakePortMap(inputs);
    this.outputs = new FakePortMap(outputs);
  }

  change() {
    this.onstatechange?.(new Event("statechange"));
  }
}

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const provideAccess = (value: FakeAccess | Promise<FakeAccess>) => {
  const requestMIDIAccess = vi.fn(() => Promise.resolve(value));
  vi.stubGlobal("navigator", { requestMIDIAccess });
  return requestMIDIAccess;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Midi access", () => {
  test("reports unavailable outside Web MIDI environments", async () => {
    vi.stubGlobal("navigator", {});
    const midi = new Midi();

    expect(midi.status.value).toBe("unavailable");
    expect(midi.inputs.value).toEqual([]);
    expect(midi.outputs.value).toEqual([]);
    expect(midi.error).toBeNull();
    await expect(midi.ready).rejects.toThrow("Web MIDI is unavailable");
  });

  test("connects successfully even with no physical ports", async () => {
    provideAccess(new FakeAccess());
    const midi = new Midi();

    await midi.ready;

    expect(midi.status.value).toBe("connected");
    expect(midi.inputs.value).toEqual([]);
    expect(midi.outputs.value).toEqual([]);
  });

  test("distinguishes denied access and retains the original error", async () => {
    const error = new DOMException("No permission", "NotAllowedError");
    provideAccess(Promise.reject(error));
    const midi = new Midi();

    await expect(midi.ready).rejects.toBe(error);
    expect(midi.status.value).toBe("denied");
    expect(midi.error).toBe(error);
  });

  test("reports and retains other access errors", async () => {
    const error = new Error("Adapter failed");
    provideAccess(Promise.reject(error));
    const midi = new Midi();

    await expect(midi.ready).rejects.toBe(error);
    expect(midi.status.value).toBe("error");
    expect(midi.error).toBe(error);
  });
});

describe("Midi ports", () => {
  test("publishes fresh connected-port snapshots on state changes", async () => {
    const input = new FakeInput("input-1", "Keys");
    const output = new FakeOutput("output-1", "Synth");
    const access = new FakeAccess([input], [output]);
    provideAccess(access);
    const midi = new Midi();
    await midi.ready;

    const firstInputs = midi.inputs.value;
    expect(firstInputs).toEqual([{ id: "input-1", name: "Keys" }]);
    expect(midi.outputs.value).toEqual([{ id: "output-1", name: "Synth" }]);
    expect(input.listeners.size).toBe(1);

    input.state = "disconnected";
    output.state = "disconnected";
    access.change();
    expect(midi.inputs.value).toEqual([]);
    expect(midi.outputs.value).toEqual([]);
    expect(midi.inputs.value).not.toBe(firstInputs);
    expect(input.listeners.size).toBe(0);

    input.state = "connected";
    access.change();
    expect(midi.inputs.value).toEqual([{ id: "input-1", name: "Keys" }]);
    expect(input.listeners.size).toBe(1);
  });

  test("uses one listener per input regardless of signal count", async () => {
    const input = new FakeInput("input-1", "Keys");
    provideAccess(new FakeAccess([input]));
    const midi = new Midi();
    await midi.ready;

    midi.in.cc(1);
    midi.in.cc(2).channel(1);
    midi.in.notes();
    midi.in.notes("input-1").channel(2);

    expect(input.listeners.size).toBe(1);
  });
});

describe("Midi destruction", () => {
  test("rejects unsettled ready and ignores later access resolution", async () => {
    const pending = deferred<FakeAccess>();
    const access = new FakeAccess([new FakeInput("input-1", "Keys")]);
    provideAccess(pending.promise);
    const midi = new Midi();
    const statuses: string[] = [];
    midi.status.subscribe((status) => statuses.push(status));

    midi.destroy();

    await expect(midi.ready).rejects.toBeInstanceOf(MidiDestroyedError);
    pending.resolve(access);
    await Promise.resolve();
    await Promise.resolve();

    expect(midi.status.value).toBe("destroyed");
    expect(statuses).toEqual(["pending", "destroyed"]);
    expect(access.onstatechange).toBeNull();
    expect(access.inputs.ports[0].listeners.size).toBe(0);
  });

  test("detaches listeners and emits empty terminal snapshots", async () => {
    const input = new FakeInput("input-1", "Keys");
    const access = new FakeAccess([input], [new FakeOutput("output-1", null)]);
    provideAccess(access);
    const midi = new Midi();
    await midi.ready;
    const inputValues: unknown[] = [];
    midi.inputs.subscribe((value) => inputValues.push(value));

    midi.destroy();

    expect(midi.status.value).toBe("destroyed");
    expect(midi.inputs.value).toEqual([]);
    expect(midi.outputs.value).toEqual([]);
    expect(inputValues).toEqual([[{ id: "input-1", name: "Keys" }], []]);
    expect(input.listeners.size).toBe(0);
    expect(access.onstatechange).toBeNull();
  });

  test("retains an already fulfilled ready result", async () => {
    provideAccess(new FakeAccess());
    const midi = new Midi();
    await midi.ready;

    midi.destroy();

    await expect(midi.ready).resolves.toBeUndefined();
    expect(midi.status.value).toBe("destroyed");
  });

  test.each([
    new DOMException("No permission", "NotAllowedError"),
    new Error("Adapter failed"),
  ])(
    "retains an already rejected ready result after destruction",
    async (error) => {
      provideAccess(Promise.reject(error));
      const midi = new Midi();
      await expect(midi.ready).rejects.toBe(error);

      midi.destroy();

      await expect(midi.ready).rejects.toBe(error);
      expect(midi.status.value).toBe("destroyed");
      expect(midi.error).toBe(error);
    },
  );
});
