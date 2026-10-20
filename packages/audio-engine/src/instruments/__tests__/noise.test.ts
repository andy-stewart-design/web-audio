import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AudioParamSchema } from "@web-audio/schema";
import type { Midi } from "@web-audio/midi";
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
  static failSetValue: Error | undefined;
  readonly gain = {
    value: 1,
    setValueAtTime: vi.fn(() => {
      if (FakeGainNode.failSetValue) throw FakeGainNode.failSetValue;
    }),
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

  constructor(
    _ctx?: BaseAudioContext,
    _name?: string,
    readonly options: AudioWorkletNodeOptions = {},
  ) {
    FakeAudioWorkletNode.instances.push(this);
  }

  emit(type: string) {
    for (const listener of this.listeners.get(type) ?? [])
      listener(new Event(type));
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

class FakeLfoNode {
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
}

class FakeCcSignal {
  hasValue = false;
  value = 0;
  private readonly _subscribers = new Set<(value: number) => void>();

  subscribe(callback: (value: number) => void) {
    this._subscribers.add(callback);
    callback(this.value);
    return () => this._subscribers.delete(callback);
  }

  get subscriberCount() {
    return this._subscribers.size;
  }
}

class TestInstrument extends Instrument {
  scheduleBar() {}

  registerLfo(node: FakeLfoNode) {
    this._lfoNodes.set("noise-lfo", node as unknown as AudioWorkletNode);
  }

  scheduleVoice(
    noise?: { color: "white" | "pink"; gain: AudioParamSchema },
    source = new FakeSourceNode(),
  ) {
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

const lfoGain = {
  type: "lfo" as const,
  id: "noise-lfo",
  outputA: staticGain,
  outputB: staticGain,
  speed: [1],
  waveform: ["sine" as const],
  phase: 0,
  norm: true,
  invert: false,
};

const midiGain = {
  type: "midi-cc" as const,
  cc: 74,
  range: { min: 0, max: 1, curve: "linear" as const },
  default: 0,
};

beforeEach(() => {
  FakeAudioWorkletNode.instances = [];
  FakeGainNode.instances = [];
  FakeGainNode.failSetValue = undefined;
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

  it("cleans up a noise source when a processor fails", () => {
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as BaseAudioContext,
      {} as never,
    );
    const source = instrument.scheduleVoice({
      color: "white",
      gain: staticGain,
    });
    const noise = FakeAudioWorkletNode.instances[0];

    instrument.retire();
    source.fireEnded();
    noise.emit("processorerror");
    noise.emit("error");

    expect(noise.disconnect).toHaveBeenCalledOnce();
    expect(FakeGainNode.instances[2].disconnect).toHaveBeenCalledOnce();
    expect(FakeGainNode.instances[3].disconnect).toHaveBeenCalledOnce();
  });

  it("does not let noise gain release change the shared stop boundary", () => {
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as BaseAudioContext,
      {} as never,
    );
    const noiseGainEnvelope = {
      type: "envelope" as const,
      min: 0,
      max: staticGain,
      a: staticGain,
      d: staticGain,
      s: staticGain,
      r: { type: "static" as const, cycle: [[10]] },
      mode: "bleed" as const,
    };

    instrument.scheduleVoice({ color: "white", gain: noiseGainEnvelope });

    expect(
      FakeAudioWorkletNode.instances[0].options.processorOptions,
    ).toMatchObject({
      startFrame: 480_000,
      stopFrame: 530_520,
    });
  });

  it("releases noise and main sources on future-note cancellation", () => {
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as BaseAudioContext,
      {} as never,
    );
    const source = instrument.scheduleVoice({
      color: "white",
      gain: staticGain,
    });
    const noise = FakeAudioWorkletNode.instances[0];
    const staleEnded = source.onended;

    instrument.cancelFutureNotes();
    staleEnded?.();
    noise.port.emit({ type: "ended" });

    expect(source.stop).toHaveBeenCalledWith(0);
    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(noise.port.postMessage).toHaveBeenCalledWith({
      type: "stop",
      frame: 0,
    });
    expect(noise.disconnect).toHaveBeenCalledOnce();
  });

  it("releases a created noise source when voice setup fails", () => {
    const setupError = new Error("noise gain setup failed");
    FakeGainNode.failSetValue = setupError;
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as BaseAudioContext,
      {} as never,
    );
    const source = new FakeSourceNode();

    expect(() =>
      instrument.scheduleVoice({ color: "white", gain: staticGain }, source),
    ).toThrow(setupError);

    const noise = FakeAudioWorkletNode.instances[0];
    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(noise.disconnect).toHaveBeenCalledOnce();
    expect(noise.port.close).toHaveBeenCalledOnce();
  });

  it("ignores duplicate noise completion after destruction", () => {
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as BaseAudioContext,
      {} as never,
    );
    const source = instrument.scheduleVoice({
      color: "white",
      gain: staticGain,
    });
    const noise = FakeAudioWorkletNode.instances[0];

    instrument.destroy();
    noise.emit("processorerror");
    noise.port.emit({ type: "ended" });
    source.fireEnded();

    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(noise.disconnect).toHaveBeenCalledOnce();
  });

  it("keeps per-voice LFO bindings independent through noise completion", () => {
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as BaseAudioContext,
      {} as never,
    );
    const lfo = new FakeLfoNode();
    instrument.registerLfo(lfo);
    const first = instrument.scheduleVoice({ color: "white", gain: lfoGain });
    const second = instrument.scheduleVoice({ color: "white", gain: lfoGain });
    const firstNoise = FakeAudioWorkletNode.instances[0];
    const secondNoise = FakeAudioWorkletNode.instances[1];

    expect(lfo.connect).toHaveBeenCalledTimes(2);
    expect(FakeGainNode.instances[3].gain.value).toBe(0);

    instrument.retire();
    first.fireEnded();
    firstNoise.port.emit({ type: "ended" });

    expect(lfo.disconnect).toHaveBeenCalledOnce();
    expect(secondNoise.disconnect).not.toHaveBeenCalled();

    second.fireEnded();
    secondNoise.port.emit({ type: "ended" });

    expect(lfo.disconnect).toHaveBeenCalledTimes(3);
  });

  it("releases per-voice MIDI bindings without affecting siblings", () => {
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as BaseAudioContext,
      {} as never,
    );
    const signal = new FakeCcSignal();
    const midi = {
      in: { cc: vi.fn(() => signal) },
    } as unknown as Midi;
    const first = instrument.scheduleVoice({ color: "white", gain: midiGain });
    const second = instrument.scheduleVoice({ color: "white", gain: midiGain });
    const firstNoise = FakeAudioWorkletNode.instances[0];
    const secondNoise = FakeAudioWorkletNode.instances[1];
    instrument.connectMidi(midi);

    expect(signal.subscriberCount).toBe(2);

    first.fireEnded();
    firstNoise.port.emit({ type: "ended" });
    expect(signal.subscriberCount).toBe(1);
    expect(secondNoise.disconnect).not.toHaveBeenCalled();

    second.fireEnded();
    secondNoise.port.emit({ type: "ended" });
    expect(signal.subscriberCount).toBe(0);
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
