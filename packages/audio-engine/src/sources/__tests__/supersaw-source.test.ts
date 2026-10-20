import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SupersawSource from "../supersaw-source";

class FakeAudioParam {
  value = 0;
}

class FakeMessagePort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  postMessage = vi.fn();
  close = vi.fn();

  emit(data: unknown) {
    this.onmessage?.({ data } as MessageEvent<unknown>);
  }
}

class FakeAudioWorkletNode {
  static instances: FakeAudioWorkletNode[] = [];
  readonly port = new FakeMessagePort();
  readonly parameters = new Map<string, FakeAudioParam>([
    ["frequency", new FakeAudioParam()],
    ["detune", new FakeAudioParam()],
    ["spread", new FakeAudioParam()],
    ["width", new FakeAudioParam()],
  ]);
  readonly connect = vi.fn((destination: AudioNode) => destination);
  readonly disconnect = vi.fn();

  constructor(
    readonly context: BaseAudioContext,
    readonly name: string,
    readonly options: AudioWorkletNodeOptions,
  ) {
    FakeAudioWorkletNode.instances.push(this);
  }
}

class FakeAudioContext {
  constructor(readonly sampleRate = 48_000) {}
}

function source(sampleRate = 48_000) {
  return new SupersawSource(
    new FakeAudioContext(sampleRate) as unknown as BaseAudioContext,
    {
      voices: 7,
      phaseSeed: 123,
      startFrame: 0,
      stopFrame: sampleRate,
    },
  );
}

beforeEach(() => {
  FakeAudioWorkletNode.instances = [];
  vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
});

afterEach(() => vi.unstubAllGlobals());

describe("SupersawSource", () => {
  it("constructs a two-channel worklet and exposes source parameters", () => {
    const supersaw = source();
    const node = FakeAudioWorkletNode.instances[0];

    expect(node.name).toBe("supersaw-processor");
    expect(node.options).toMatchObject({
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: {
        voices: 7,
        phaseSeed: 123,
        startFrame: 0,
        stopFrame: 48_000,
      },
    });
    expect(supersaw.frequency).toBe(node.parameters.get("frequency"));
    expect(supersaw.detune).toBe(node.parameters.get("detune"));
    expect(supersaw.spread).toBe(node.parameters.get("spread"));
    expect(supersaw.width).toBe(node.parameters.get("width"));
  });

  it.each([44_100, 48_000])(
    "preserves aligned sample-frame messages at %i Hz",
    (sampleRate) => {
      const supersaw = source(sampleRate);
      const port = FakeAudioWorkletNode.instances[0].port;

      supersaw.start(6007 / sampleRate);
      supersaw.stop(6008 / sampleRate);

      expect(port.postMessage.mock.calls).toEqual([
        [{ type: "start", frame: 6007 }],
        [{ type: "stop", frame: 6008 }],
      ]);
    },
  );

  it("translates fractional scheduled times to precise sample-frame messages", () => {
    const supersaw = source();
    const port = FakeAudioWorkletNode.instances[0].port;

    supersaw.start(1.000001);
    supersaw.start(2);
    supersaw.stop(2.5);
    supersaw.stop(2.25);

    expect(port.postMessage.mock.calls).toEqual([
      [{ type: "start", frame: 48_001 }],
      [{ type: "stop", frame: 120_000 }],
      [{ type: "stop", frame: 108_000 }],
    ]);
  });

  it("forwards graph connections and disconnects resources idempotently", () => {
    const supersaw = source();
    const node = FakeAudioWorkletNode.instances[0];
    const destination = {} as AudioNode;

    expect(supersaw.connect(destination)).toBe(destination);
    supersaw.disconnect();
    supersaw.disconnect();

    expect(node.connect).toHaveBeenCalledOnce();
    expect(node.disconnect).toHaveBeenCalledOnce();
    expect(node.port.close).toHaveBeenCalledOnce();
    expect(node.port.onmessage).toBeNull();
  });

  it("completes once and ignores late messages and operations", () => {
    const supersaw = source();
    const node = FakeAudioWorkletNode.instances[0];
    const ended = vi.fn();
    supersaw.onended = ended;

    node.port.emit({ type: "ignored" });
    node.port.emit({ type: "ended" });
    node.port.emit({ type: "ended" });
    supersaw.stop(1);
    supersaw.disconnect();

    expect(ended).toHaveBeenCalledOnce();
    expect(node.port.postMessage).not.toHaveBeenCalled();
  });

  it("leaves future cancellation to the shared owner without timers", () => {
    const supersaw = source();
    const node = FakeAudioWorkletNode.instances[0];
    const ended = vi.fn();
    supersaw.onended = ended;

    supersaw.start(10);
    supersaw.stop(0);

    expect(ended).not.toHaveBeenCalled();
    expect(node.port.postMessage.mock.calls).toEqual([
      [{ type: "start", frame: 480_000 }],
      [{ type: "stop", frame: 0 }],
    ]);
  });
});
