import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AudioParamSchema, EffectSchema } from "@web-audio/schema";
import type { EventScheduleContext } from "../../events/types";
import type { ResolvedEnvelopeSchema } from "../../parameters/types";
import type { ScheduledSource } from "../../sources/types";
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

class FakeAudioNode {
  readonly disconnect = vi.fn();
}

class FakeGainNode extends FakeAudioNode {
  static instances: FakeGainNode[] = [];
  static constructionCount = 0;
  static failOnConstruction: number | undefined;
  static setValueCallCount = 0;
  static failSetValue: Error | undefined;
  static failSetValueOnCall: number | undefined;
  readonly gain = {
    value: 1,
    setValueAtTime: vi.fn(() => {
      FakeGainNode.setValueCallCount += 1;
      if (
        FakeGainNode.failSetValue &&
        (FakeGainNode.failSetValueOnCall === undefined ||
          FakeGainNode.setValueCallCount === FakeGainNode.failSetValueOnCall)
      ) {
        throw FakeGainNode.failSetValue;
      }
    }),
    linearRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
  };
  readonly connect = vi.fn();

  constructor() {
    super();
    FakeGainNode.constructionCount += 1;
    if (FakeGainNode.constructionCount === FakeGainNode.failOnConstruction)
      throw new Error("gain construction failed");
    FakeGainNode.instances.push(this);
  }
}

class FakeLfoNode {
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
}

class FakeCcSignal {
  hasValue = false;
  private _subscriber: ((value: number) => void) | undefined;

  subscribe(callback: (value: number) => void) {
    this._subscriber = callback;
    callback(0);
    return () => {
      this._subscriber = undefined;
    };
  }

  emit(value: number) {
    this.hasValue = true;
    this._subscriber?.(value);
  }

  get subscriberCount() {
    return this._subscriber ? 1 : 0;
  }
}

class TestInstrument extends Instrument {
  scheduleBar() {}

  registerLfo(node: FakeLfoNode) {
    this._lfoNodes.set("sub-lfo", node as unknown as AudioWorkletNode);
  }

  scheduleVoice(
    sources: [{ node: FakeSourceNode }, ...{ node: FakeSourceNode }[]],
    sourceGain?: AudioParamSchema,
    options: {
      subSource?: { node: FakeSourceNode; gain: AudioParamSchema };
      effects?: EffectSchema[];
    } = {},
  ) {
    this._scheduleVoice({
      sources,
      sourceGain,
      subSource: options.subSource
        ? {
            source: { node: options.subSource.node },
            gain: options.subSource.gain,
          }
        : undefined,
      event: eventContext(),
      gainEnvelope: resolvedEnvelope(),
      effects: options.effects ?? [],
    });
  }

  track(
    sourceNodes: FakeSourceNode[],
    audioNodes: FakeAudioNode[],
    completionCleanups: (() => void)[] = [],
    startTime = 0,
  ) {
    const scheduled = this._createScheduledNote(sourceNodes, startTime);
    audioNodes.forEach((node) =>
      scheduled.audioNodes.add(node as unknown as AudioNode),
    );
    scheduled.completionCleanups.push(...completionCleanups);
    sourceNodes.forEach((source) => scheduled.startedSourceNodes.add(source));
    this._track(scheduled);
  }
}

class FakeAudioContext {
  readonly currentTime = 0;
  readonly destination = {} as AudioNode;

  createGain() {
    return new FakeGainNode() as unknown as GainNode;
  }
}

function eventContext() {
  return {
    barIndex: 0,
    hitIndex: 0,
    startTime: 10,
    duration: 1,
    endTime: 11,
  } satisfies EventScheduleContext;
}

function resolvedEnvelope() {
  return {
    min: 0,
    max: 1,
    a: 0,
    d: 0,
    s: 1,
    r: 0,
    mode: "bleed",
  } satisfies ResolvedEnvelopeSchema;
}

beforeEach(() => {
  FakeGainNode.instances = [];
  FakeGainNode.constructionCount = 0;
  FakeGainNode.failOnConstruction = undefined;
  FakeGainNode.setValueCallCount = 0;
  FakeGainNode.failSetValue = undefined;
  FakeGainNode.failSetValueOnCall = undefined;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Instrument source ownership", () => {
  it.each([
    [0, 1],
    [1, 0],
  ])(
    "keeps shared voice resources until both sources end (order %s, %s)",
    async (firstIndex, secondIndex) => {
      const instrument = new TestInstrument(
        new FakeAudioContext() as unknown as BaseAudioContext,
        {} as never,
      );
      const sources = [new FakeSourceNode(), new FakeSourceNode()];
      const sharedNode = new FakeAudioNode();
      const cleanup = vi.fn();
      instrument.track(sources, [sharedNode], [cleanup]);
      instrument.retire();

      sources[firstIndex].fireEnded();

      expect(sources[firstIndex].disconnect).toHaveBeenCalledOnce();
      expect(sources[secondIndex].disconnect).not.toHaveBeenCalled();
      expect(sharedNode.disconnect).not.toHaveBeenCalled();
      expect(cleanup).not.toHaveBeenCalled();

      let finished = false;
      instrument.finished.then(() => {
        finished = true;
      });
      await Promise.resolve();
      expect(finished).toBe(false);

      sources[secondIndex].fireEnded();
      sources[firstIndex].fireEnded();
      sources[secondIndex].fireEnded();
      await Promise.resolve();

      expect(sources[0].disconnect).toHaveBeenCalledOnce();
      expect(sources[1].disconnect).toHaveBeenCalledOnce();
      expect(sharedNode.disconnect).toHaveBeenCalledOnce();
      expect(cleanup).toHaveBeenCalledOnce();
      expect(finished).toBe(true);
    },
  );

  it("rejects an empty source collection", () => {
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as BaseAudioContext,
      {} as never,
    );

    expect(() => instrument.track([], [])).toThrow(
      "A scheduled voice requires at least one source.",
    );
  });

  it("cancels future sources and ignores stale completion callbacks", () => {
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as BaseAudioContext,
      {} as never,
    );
    const sources = [new FakeSourceNode(), new FakeSourceNode()];
    const sharedNode = new FakeAudioNode();
    const cleanup = vi.fn();
    instrument.track(sources, [sharedNode], [cleanup], 1);
    const staleCallbacks = sources.map((source) => source.onended);

    instrument.cancelFutureNotes();
    staleCallbacks.forEach((callback) => callback?.());

    sources.forEach((source) => {
      expect(source.stop).toHaveBeenCalledOnce();
      expect(source.disconnect).toHaveBeenCalledOnce();
      expect(source.onended).toBeNull();
    });
    expect(sharedNode.disconnect).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("cancels a future voice without affecting an active overlapping voice", () => {
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as BaseAudioContext,
      {} as never,
    );
    const active = new FakeSourceNode();
    const future = new FakeSourceNode();
    const activeCleanup = vi.fn();
    const futureCleanup = vi.fn();
    instrument.track([active], [], [activeCleanup]);
    instrument.track([future], [], [futureCleanup], 1);

    instrument.cancelFutureNotes();

    expect(active.stop).not.toHaveBeenCalled();
    expect(active.disconnect).not.toHaveBeenCalled();
    expect(activeCleanup).not.toHaveBeenCalled();
    expect(future.stop).toHaveBeenCalledOnce();
    expect(future.disconnect).toHaveBeenCalledOnce();
    expect(futureCleanup).toHaveBeenCalledOnce();

    active.fireEnded();
    expect(active.disconnect).toHaveBeenCalledOnce();
    expect(activeCleanup).toHaveBeenCalledOnce();
  });

  it("releases a partially constructed voice when source start fails", () => {
    vi.stubGlobal("GainNode", FakeGainNode);
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as BaseAudioContext,
      {} as never,
    );
    const source = new FakeSourceNode();
    const error = new Error("start failed");
    source.start.mockImplementation(() => {
      throw error;
    });

    expect(() =>
      instrument.scheduleVoice([{ node: source }], {
        type: "static",
        cycle: [[1]],
      }),
    ).toThrow(error);
    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(
      FakeGainNode.instances
        .slice(-2)
        .every((node) => node.disconnect.mock.calls.length === 1),
    ).toBe(true);
    expect(source.onended).toBeNull();
  });

  it("stops an earlier source when a later source fails to start", async () => {
    vi.stubGlobal("GainNode", FakeGainNode);
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as BaseAudioContext,
      {} as never,
    );
    const first = new FakeSourceNode();
    const second = new FakeSourceNode();
    const error = new Error("second start failed");
    second.start.mockImplementation(() => {
      throw error;
    });

    expect(() =>
      instrument.scheduleVoice([{ node: first }, { node: second }]),
    ).toThrow(error);
    expect(first.stop).toHaveBeenCalledWith(0);
    expect(first.disconnect).toHaveBeenCalledOnce();
    expect(second.stop).toHaveBeenCalledWith(0);
    expect(second.disconnect).toHaveBeenCalledOnce();
    expect(first.onended).toBeNull();
    expect(second.onended).toBeNull();

    instrument.retire();
    await Promise.resolve();
    let finished = false;
    instrument.finished.then(() => {
      finished = true;
    });
    await Promise.resolve();
    expect(finished).toBe(true);
  });

  it("reports cleanup failures without changing a setup error", () => {
    vi.stubGlobal("GainNode", FakeGainNode);
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as BaseAudioContext,
      {} as never,
    );
    const source = new FakeSourceNode();
    const setupError = new Error("start failed");
    const cleanupError = new Error("disconnect failed");
    const report = vi.spyOn(console, "error").mockImplementation(() => {});
    source.start.mockImplementation(() => {
      throw setupError;
    });
    source.disconnect.mockImplementation(() => {
      throw cleanupError;
    });

    let thrown: unknown;
    try {
      instrument.scheduleVoice([{ node: source }]);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(setupError);
    expect(setupError.cause).toBeUndefined();
    expect(report).toHaveBeenCalledOnce();
  });

  it("continues cleanup after a callback throws and still retires", async () => {
    const report = vi.spyOn(console, "error").mockImplementation(() => {});
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as BaseAudioContext,
      {} as never,
    );
    const source = new FakeSourceNode();
    const cleanupError = new Error("cleanup failed");
    const laterCleanup = vi.fn();
    instrument.track(
      [source],
      [],
      [
        () => {
          throw cleanupError;
        },
        laterCleanup,
      ],
    );
    instrument.retire();

    expect(() => source.fireEnded()).not.toThrow();
    expect(report).toHaveBeenCalledOnce();
    expect(laterCleanup).toHaveBeenCalledOnce();
    await Promise.resolve();
    let finished = false;
    instrument.finished.then(() => {
      finished = true;
    });
    await Promise.resolve();
    expect(finished).toBe(true);
  });

  it("releases the graph and preserves a source stop failure", () => {
    vi.stubGlobal("GainNode", FakeGainNode);
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as BaseAudioContext,
      {} as never,
    );
    const source = new FakeSourceNode();
    const error = new Error("stop failed");
    source.stop.mockImplementation(() => {
      throw error;
    });

    expect(() => instrument.scheduleVoice([{ node: source }])).toThrow(error);
    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(source.onended).toBeNull();
  });

  it("releases the configured source-gain stage when parameter setup fails", () => {
    vi.stubGlobal("GainNode", FakeGainNode);
    const error = new Error("source-gain setup failed");
    FakeGainNode.failSetValue = error;
    FakeGainNode.failSetValueOnCall = 2;
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as BaseAudioContext,
      {} as never,
    );
    const source = new FakeSourceNode();

    expect(() =>
      instrument.scheduleVoice([{ node: source }], {
        type: "static",
        cycle: [[0.5]],
      }),
    ).toThrow(error);

    const mainGain = FakeGainNode.instances.at(-1);
    expect(source.stop).toHaveBeenCalledWith(0);
    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(mainGain?.disconnect).toHaveBeenCalledOnce();
    expect(source.onended).toBeNull();
  });

  it("keeps main and sub sources alive until both complete", () => {
    vi.stubGlobal("GainNode", FakeGainNode);
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as BaseAudioContext,
      {} as never,
    );
    const main = new FakeSourceNode();
    const sub = new FakeSourceNode();
    instrument.scheduleVoice([{ node: main }], undefined, {
      subSource: {
        node: sub,
        gain: { type: "static", cycle: [[0.5]] },
      },
    });
    instrument.retire();

    main.fireEnded();

    expect(main.disconnect).toHaveBeenCalledOnce();
    expect(sub.disconnect).not.toHaveBeenCalled();
    expect(
      FakeGainNode.instances
        .slice(-2)
        .every((node) => node.disconnect.mock.calls.length === 0),
    ).toBe(true);

    sub.fireEnded();

    expect(sub.disconnect).toHaveBeenCalledOnce();
    expect(
      FakeGainNode.instances
        .slice(-2)
        .every((node) => node.disconnect.mock.calls.length === 1),
    ).toBe(true);
  });

  it("cancels main, sub, and both gain stages as one future voice", () => {
    vi.stubGlobal("GainNode", FakeGainNode);
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as BaseAudioContext,
      {} as never,
    );
    const main = new FakeSourceNode();
    const sub = new FakeSourceNode();
    instrument.scheduleVoice([{ node: main }], undefined, {
      subSource: {
        node: sub,
        gain: { type: "static", cycle: [[0.5]] },
      },
    });

    instrument.cancelFutureNotes();

    expect(main.stop).toHaveBeenCalledWith(0);
    expect(sub.stop).toHaveBeenCalledWith(0);
    expect(main.disconnect).toHaveBeenCalledOnce();
    expect(sub.disconnect).toHaveBeenCalledOnce();
    expect(
      FakeGainNode.instances
        .slice(-2)
        .every((node) => node.disconnect.mock.calls.length === 1),
    ).toBe(true);
  });

  it("attaches and cleans up an LFO on the sub gain target", () => {
    vi.stubGlobal("GainNode", FakeGainNode);
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as BaseAudioContext,
      {} as never,
    );
    const lfo = new FakeLfoNode();
    instrument.registerLfo(lfo);
    const main = new FakeSourceNode();
    const sub = new FakeSourceNode();
    instrument.scheduleVoice([{ node: main }], undefined, {
      subSource: {
        node: sub,
        gain: {
          type: "lfo",
          id: "sub-lfo",
          outputA: { type: "static", cycle: [[0]] },
          outputB: { type: "static", cycle: [[1]] },
          speed: [1],
          waveform: ["sine"],
          phase: 0,
          norm: false,
          invert: false,
        },
      },
    });

    const subGain = FakeGainNode.instances.at(-1);
    expect(subGain?.gain.value).toBe(0);
    expect(lfo.connect).toHaveBeenCalledWith(subGain?.gain);

    main.fireEnded();
    expect(lfo.disconnect).not.toHaveBeenCalled();
    sub.fireEnded();
    expect(lfo.disconnect).toHaveBeenCalledWith(subGain?.gain);
  });

  it("initializes, updates, and cleans up a MIDI sub gain target", () => {
    vi.stubGlobal("GainNode", FakeGainNode);
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as BaseAudioContext,
      {} as never,
    );
    const signal = new FakeCcSignal();
    const midi = { in: { cc: vi.fn(() => signal) } };
    instrument.connectMidi(midi as never);
    const main = new FakeSourceNode();
    const sub = new FakeSourceNode();
    instrument.scheduleVoice([{ node: main }], undefined, {
      subSource: {
        node: sub,
        gain: {
          type: "midi-cc",
          cc: 74,
          range: { min: 0, max: 1, curve: "linear" },
          default: 0,
        },
      },
    });

    const subGain = FakeGainNode.instances.at(-1);
    expect(subGain?.gain.value).toBe(0);
    expect(signal.subscriberCount).toBe(1);
    signal.emit(0.75);
    expect(subGain?.gain.setTargetAtTime).toHaveBeenCalledWith(0.75, 0, 0.01);

    main.fireEnded();
    expect(signal.subscriberCount).toBe(1);
    sub.fireEnded();
    expect(signal.subscriberCount).toBe(0);
  });

  it("releases both sources and sub bindings when the sub start fails", () => {
    vi.stubGlobal("GainNode", FakeGainNode);
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as BaseAudioContext,
      {} as never,
    );
    const signal = new FakeCcSignal();
    instrument.connectMidi({ in: { cc: vi.fn(() => signal) } } as never);
    const main = new FakeSourceNode();
    const sub = new FakeSourceNode();
    const error = new Error("sub start failed");
    sub.start.mockImplementation(() => {
      throw error;
    });

    expect(() =>
      instrument.scheduleVoice([{ node: main }], undefined, {
        subSource: {
          node: sub,
          gain: {
            type: "midi-cc",
            cc: 74,
            range: { min: 0, max: 1, curve: "linear" },
            default: 0,
          },
        },
      }),
    ).toThrow(error);

    expect(main.stop).toHaveBeenCalledWith(0);
    expect(sub.stop).toHaveBeenCalledWith(0);
    expect(main.disconnect).toHaveBeenCalledOnce();
    expect(sub.disconnect).toHaveBeenCalledOnce();
    expect(signal.subscriberCount).toBe(0);
  });

  it("releases both sources and sub bindings after later setup fails", () => {
    vi.stubGlobal("GainNode", FakeGainNode);
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as BaseAudioContext,
      {} as never,
    );
    const signal = new FakeCcSignal();
    instrument.connectMidi({ in: { cc: vi.fn(() => signal) } } as never);
    FakeGainNode.failOnConstruction = FakeGainNode.constructionCount + 3;
    const main = new FakeSourceNode();
    const sub = new FakeSourceNode();

    expect(() =>
      instrument.scheduleVoice([{ node: main }], undefined, {
        subSource: {
          node: sub,
          gain: {
            type: "midi-cc",
            cc: 74,
            range: { min: 0, max: 1, curve: "linear" },
            default: 0,
          },
        },
        effects: [{ type: "gain", gain: { type: "static", cycle: [[1]] } }],
      }),
    ).toThrow("gain construction failed");

    expect(main.stop).toHaveBeenCalledWith(0);
    expect(sub.stop).toHaveBeenCalledWith(0);
    expect(main.disconnect).toHaveBeenCalledOnce();
    expect(sub.disconnect).toHaveBeenCalledOnce();
    expect(signal.subscriberCount).toBe(0);
    expect(
      FakeGainNode.instances
        .slice(-2)
        .every((node) => node.disconnect.mock.calls.length === 1),
    ).toBe(true);
  });
});
