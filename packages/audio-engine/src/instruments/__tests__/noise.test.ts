import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AudioParamSchema } from "@web-audio/schema";
import type { ScheduledSource } from "@/types";
import Instrument from "../instrument";

class FakeSourceNode implements ScheduledSource {
  onended: ScheduledSource["onended"] = null;
  readonly connect = vi.fn((destination: AudioNode) => destination);
  readonly disconnect = vi.fn();
  readonly start = vi.fn();
  readonly stop = vi.fn();

  fireEnded() {
    this.onended?.();
  }
}

class FakeGainNode {
  static instances: FakeGainNode[] = [];
  readonly gain = {
    value: 1,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  };
  readonly connect = vi.fn((destination: AudioNode) => destination);
  readonly disconnect = vi.fn();

  constructor() {
    FakeGainNode.instances.push(this);
  }
}

class FakeMessagePort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  readonly postMessage = vi.fn();
  readonly close = vi.fn();

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

  constructor() {
    FakeAudioWorkletNode.instances.push(this);
  }
}

class FakeAudioContext {
  readonly currentTime = 0;
  readonly sampleRate = 48_000;
  readonly destination = {} as AudioNode;
  createGain() {
    return new FakeGainNode() as unknown as GainNode;
  }
}

class TestInstrument extends Instrument {
  scheduleBar() {}

  scheduleVoice(noise?: { color: "white" | "pink"; gain: AudioParamSchema }) {
    const source = new FakeSourceNode();
    this._scheduleVoice({
      sources: [{ node: source }],
      event: {
        barIndex: 0,
        hitIndex: 0,
        startTime: 10,
        duration: 1,
        endTime: 11,
      },
      gainEnvelope: {
        min: 0,
        max: 1,
        a: 0,
        d: 0,
        s: 1,
        r: 0,
        mode: "bleed",
      },
      effects: [],
      noise,
    });
    return source;
  }
}

const staticGain = {
  type: "static" as const,
  cycle: [[1]],
};

beforeEach(() => {
  FakeAudioWorkletNode.instances = [];
  FakeGainNode.instances = [];
  vi.stubGlobal("GainNode", FakeGainNode);
  vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
});

afterEach(() => vi.unstubAllGlobals());

describe("Instrument noise voice composition", () => {
  it("does not allocate a noise source when the layer is omitted", () => {
    const ctx = new FakeAudioContext();
    const instrument = new TestInstrument(
      ctx as unknown as BaseAudioContext,
      {} as never,
    );

    instrument.scheduleVoice();

    expect(FakeAudioWorkletNode.instances).toHaveLength(0);
    expect(FakeGainNode.instances).toHaveLength(3);
  });

  it("mixes one owned noise source before the shared voice gain", () => {
    const ctx = new FakeAudioContext();
    const instrument = new TestInstrument(
      ctx as unknown as BaseAudioContext,
      {} as never,
    );
    const source = instrument.scheduleVoice({
      color: "pink",
      gain: staticGain,
    });
    const noise = FakeAudioWorkletNode.instances[0];
    const [balancing, mute, voiceGain, noiseGain] = FakeGainNode.instances;

    expect(noise.connect).toHaveBeenCalledWith(noiseGain);
    expect(noiseGain.connect).toHaveBeenCalledWith(voiceGain);
    expect(source.connect).toHaveBeenCalledWith(voiceGain);
    expect(noise.port.postMessage).toHaveBeenCalledWith({
      type: "start",
      frame: 480_000,
    });
    expect(balancing.connect).toHaveBeenCalledWith(mute);

    instrument.retire();
    source.fireEnded();

    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(noise.disconnect).not.toHaveBeenCalled();
    expect(voiceGain.disconnect).not.toHaveBeenCalled();

    noise.port.emit({ type: "ended" });

    expect(noise.disconnect).toHaveBeenCalledOnce();
    expect(noiseGain.disconnect).toHaveBeenCalledOnce();
    expect(voiceGain.disconnect).toHaveBeenCalledOnce();
  });
});
