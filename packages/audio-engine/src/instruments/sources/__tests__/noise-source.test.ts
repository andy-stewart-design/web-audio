import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NoiseSource from "../noise-source";

class FakeMessagePort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  postMessage = vi.fn();
  close = vi.fn();

  emit(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }
}

class FakeAudioWorkletNode {
  static instances: FakeAudioWorkletNode[] = [];
  readonly port = new FakeMessagePort();
  readonly connect = vi.fn((destination: AudioNode) => destination);
  readonly disconnect = vi.fn();
  readonly listeners = new Map<string, Set<EventListener>>();
  readonly addEventListener = vi.fn((type: string, listener: EventListener) => {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  });
  readonly removeEventListener = vi.fn(
    (type: string, listener: EventListener) => {
      this.listeners.get(type)?.delete(listener);
    },
  );

  constructor(
    readonly context: BaseAudioContext,
    readonly name: string,
    readonly options: AudioWorkletNodeOptions,
  ) {
    FakeAudioWorkletNode.instances.push(this);
  }

  emit(type: string) {
    for (const listener of this.listeners.get(type) ?? [])
      listener(new Event(type));
  }
}

class FakeAudioContext {
  constructor(readonly sampleRate = 48_000) {}
}

function source(sampleRate = 48_000) {
  return new NoiseSource(
    new FakeAudioContext(sampleRate) as unknown as BaseAudioContext,
    {
      color: "pink",
      seed: 123,
      startFrame: 37,
      stopFrame: 211,
    },
  );
}

beforeEach(() => {
  FakeAudioWorkletNode.instances = [];
  vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
});

afterEach(() => vi.unstubAllGlobals());

describe("NoiseSource", () => {
  it("constructs a mono worklet with generation options", () => {
    const noise = source();
    const node = FakeAudioWorkletNode.instances[0];

    expect(node.name).toBe("noise-processor");
    expect(node.options).toMatchObject({
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: {
        color: "pink",
        seed: 123,
        startFrame: 37,
        stopFrame: 211,
      },
    });
    expect(noise.node).toBe(node);
  });

  it.each([44_100, 48_000])(
    "preserves aligned sample-frame messages at %i Hz",
    (sampleRate) => {
      const noise = source(sampleRate);
      const port = FakeAudioWorkletNode.instances[0].port;

      noise.start(6007 / sampleRate);
      noise.stop(6008 / sampleRate);

      expect(port.postMessage.mock.calls).toEqual([
        [{ type: "start", frame: 6007 }],
        [{ type: "stop", frame: 6008 }],
      ]);
    },
  );

  it("translates fractional scheduled times and ignores duplicate starts", () => {
    const noise = source();
    const port = FakeAudioWorkletNode.instances[0].port;

    noise.start(1.000001);
    noise.start(2);
    noise.stop(2.5);
    noise.stop(2.25);

    expect(port.postMessage.mock.calls).toEqual([
      [{ type: "start", frame: 48_001 }],
      [{ type: "stop", frame: 120_000 }],
      [{ type: "stop", frame: 108_000 }],
    ]);
  });

  it("forwards graph connections and disconnects resources idempotently", () => {
    const noise = source();
    const node = FakeAudioWorkletNode.instances[0];
    const destination = {} as AudioNode;

    expect(noise.connect(destination)).toBe(destination);
    noise.disconnect();
    noise.disconnect();

    expect(node.connect).toHaveBeenCalledOnce();
    expect(node.disconnect).toHaveBeenCalledOnce();
    expect(node.port.close).toHaveBeenCalledOnce();
    expect(node.removeEventListener).toHaveBeenCalledTimes(2);
    expect(node.port.onmessage).toBeNull();
  });

  it.each(["processorerror", "error"])(
    "completes ownership on %s without double completion",
    (eventType) => {
      const noise = source();
      const node = FakeAudioWorkletNode.instances[0];
      const ended = vi.fn();
      noise.onended = ended;

      node.emit(eventType);
      node.emit("processorerror");
      node.port.emit({ type: "ended" });
      noise.stop(1);
      noise.disconnect();

      expect(ended).toHaveBeenCalledOnce();
      expect(node.port.postMessage).not.toHaveBeenCalled();
    },
  );

  it("completes once from the worklet and ignores late messages and operations", () => {
    const noise = source();
    const node = FakeAudioWorkletNode.instances[0];
    const ended = vi.fn();
    noise.onended = ended;

    node.port.emit({ type: "ignored" });
    node.port.emit({ type: "ended" });
    node.port.emit({ type: "ended" });
    noise.stop(1);
    noise.disconnect();

    expect(ended).toHaveBeenCalledOnce();
    expect(node.port.postMessage).not.toHaveBeenCalled();
  });

  it("leaves future cancellation to the shared owner without timers", () => {
    const noise = source();
    const node = FakeAudioWorkletNode.instances[0];
    const ended = vi.fn();
    noise.onended = ended;

    noise.start(10);
    noise.stop(0);

    expect(ended).not.toHaveBeenCalled();
    expect(node.port.postMessage.mock.calls).toEqual([
      [{ type: "start", frame: 480_000 }],
      [{ type: "stop", frame: 0 }],
    ]);
  });
});
