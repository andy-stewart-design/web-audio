import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AudioParamSchema, EffectSchema } from "@web-audio/schema";
import type { EventScheduleContext } from "../../events/types";
import type { ResolvedEnvelopeSchema } from "../../parameters/types";
import type { ScheduledSource } from "../../sources/types";
import Instrument from "../instrument";

class FakeAudioParam {
  value = 0;
  readonly setTargetAtTime = vi.fn();
}

class FakeSourceNode implements ScheduledSource {
  onended: ScheduledSource["onended"] = null;
  readonly detune = new FakeAudioParam();
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
  private readonly _subscribers = new Set<(value: number) => void>();

  subscribe(callback: (value: number) => void) {
    this._subscribers.add(callback);
    callback(0);
    return () => {
      this._subscribers.delete(callback);
    };
  }

  emit(value: number) {
    this.hasValue = true;
    this._subscribers.forEach((subscriber) => subscriber(value));
  }

  get subscriberCount() {
    return this._subscribers.size;
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
      sub?: { node: FakeSourceNode; gain: AudioParamSchema };
      detune?: AudioParamSchema;
      effects?: EffectSchema[];
    } = {},
  ) {
    const event = eventContext();
    this._scheduleVoice({
      sources,
      sourceGain,
      sub: options.sub
        ? {
            source: { node: options.sub.node },
            gain: options.sub.gain,
          }
        : undefined,
      detune: options.detune
        ? {
            params: [
              ...sources.map(({ node }) => node.detune),
              ...(options.sub ? [options.sub.node.detune] : []),
            ] as unknown as [AudioParam, ...AudioParam[]],
            resolved: this._resolveDetune(options.detune, event),
          }
        : undefined,
      event,
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
      sub: {
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
      sub: {
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
      sub: {
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
      sub: {
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
        sub: {
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
        sub: {
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

  it("releases the sub gain stage when its parameter setup fails", () => {
    vi.stubGlobal("GainNode", FakeGainNode);
    const error = new Error("sub gain setup failed");
    FakeGainNode.failSetValue = error;
    FakeGainNode.failSetValueOnCall = 2;
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as BaseAudioContext,
      {} as never,
    );
    const main = new FakeSourceNode();
    const sub = new FakeSourceNode();

    expect(() =>
      instrument.scheduleVoice([{ node: main }], undefined, {
        sub: {
          node: sub,
          gain: { type: "static", cycle: [[0.5]] },
        },
      }),
    ).toThrow(error);

    expect(main.stop).toHaveBeenCalledWith(0);
    expect(sub.stop).toHaveBeenCalledWith(0);
    expect(main.disconnect).toHaveBeenCalledOnce();
    expect(sub.disconnect).toHaveBeenCalledOnce();
    expect(FakeGainNode.instances.at(-1)?.disconnect).toHaveBeenCalledOnce();
  });

  it("fans detune LFOs to both layers and detaches one voice at a time", () => {
    vi.stubGlobal("GainNode", FakeGainNode);
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as BaseAudioContext,
      {} as never,
    );
    const lfo = new FakeLfoNode();
    instrument.registerLfo(lfo);
    const detune: AudioParamSchema = {
      type: "lfo",
      id: "sub-lfo",
      outputA: { type: "static", cycle: [[-5]] },
      outputB: { type: "static", cycle: [[5]] },
      speed: [1],
      waveform: ["sine"],
      phase: 0,
      norm: false,
      invert: false,
    };
    const firstMain = new FakeSourceNode();
    const firstSub = new FakeSourceNode();
    const secondMain = new FakeSourceNode();
    const secondSub = new FakeSourceNode();
    instrument.scheduleVoice([{ node: firstMain }], undefined, {
      sub: { node: firstSub, gain: { type: "static", cycle: [[1]] } },
      detune,
    });
    instrument.scheduleVoice([{ node: secondMain }], undefined, {
      sub: { node: secondSub, gain: { type: "static", cycle: [[1]] } },
      detune,
    });

    expect(lfo.connect).toHaveBeenCalledTimes(4);
    expect(lfo.connect).toHaveBeenCalledWith(firstMain.detune);
    expect(lfo.connect).toHaveBeenCalledWith(firstSub.detune);
    expect(lfo.connect).toHaveBeenCalledWith(secondMain.detune);
    expect(lfo.connect).toHaveBeenCalledWith(secondSub.detune);

    firstMain.fireEnded();
    firstSub.fireEnded();
    expect(lfo.disconnect).toHaveBeenCalledTimes(2);
    expect(lfo.disconnect).toHaveBeenCalledWith(firstMain.detune);
    expect(lfo.disconnect).toHaveBeenCalledWith(firstSub.detune);
    expect(secondMain.disconnect).not.toHaveBeenCalled();
    expect(secondSub.disconnect).not.toHaveBeenCalled();

    secondMain.fireEnded();
    secondSub.fireEnded();
    expect(lfo.disconnect).toHaveBeenCalledTimes(4);
    expect(lfo.disconnect).toHaveBeenCalledWith(secondMain.detune);
    expect(lfo.disconnect).toHaveBeenCalledWith(secondSub.detune);
    instrument.retire();
    expect(lfo.disconnect).toHaveBeenCalledTimes(5);
  });

  it("updates only the surviving voice after detune MIDI cleanup", () => {
    vi.stubGlobal("GainNode", FakeGainNode);
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as BaseAudioContext,
      {} as never,
    );
    const signal = new FakeCcSignal();
    instrument.connectMidi({ in: { cc: vi.fn(() => signal) } } as never);
    const detune: AudioParamSchema = {
      type: "midi-cc",
      cc: 74,
      range: { min: -10, max: 10, curve: "linear" },
      default: 0,
    };
    const firstMain = new FakeSourceNode();
    const firstSub = new FakeSourceNode();
    const secondMain = new FakeSourceNode();
    const secondSub = new FakeSourceNode();
    instrument.scheduleVoice([{ node: firstMain }], undefined, {
      sub: { node: firstSub, gain: { type: "static", cycle: [[1]] } },
      detune,
    });
    instrument.scheduleVoice([{ node: secondMain }], undefined, {
      sub: { node: secondSub, gain: { type: "static", cycle: [[1]] } },
      detune,
    });

    expect(signal.subscriberCount).toBe(2);
    signal.emit(0.25);
    expect(firstMain.detune.setTargetAtTime).toHaveBeenCalledWith(-5, 0, 0.01);
    expect(firstSub.detune.setTargetAtTime).toHaveBeenCalledWith(-5, 0, 0.01);
    expect(secondMain.detune.setTargetAtTime).toHaveBeenCalledWith(-5, 0, 0.01);
    expect(secondSub.detune.setTargetAtTime).toHaveBeenCalledWith(-5, 0, 0.01);

    firstMain.fireEnded();
    firstSub.fireEnded();
    expect(signal.subscriberCount).toBe(1);
    signal.emit(0.75);
    expect(firstMain.detune.setTargetAtTime).toHaveBeenCalledOnce();
    expect(firstSub.detune.setTargetAtTime).toHaveBeenCalledOnce();
    expect(secondMain.detune.setTargetAtTime).toHaveBeenLastCalledWith(
      5,
      0,
      0.01,
    );
    expect(secondSub.detune.setTargetAtTime).toHaveBeenLastCalledWith(
      5,
      0,
      0.01,
    );

    secondMain.fireEnded();
    secondSub.fireEnded();
    expect(signal.subscriberCount).toBe(0);
    instrument.retire();
  });

  it("detaches each voice's source and sub LFO bindings independently", () => {
    vi.stubGlobal("GainNode", FakeGainNode);
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as BaseAudioContext,
      {} as never,
    );
    const lfo = new FakeLfoNode();
    instrument.registerLfo(lfo);
    const gain: AudioParamSchema = {
      type: "lfo",
      id: "sub-lfo",
      outputA: { type: "static", cycle: [[0]] },
      outputB: { type: "static", cycle: [[1]] },
      speed: [1],
      waveform: ["sine"],
      phase: 0,
      norm: false,
      invert: false,
    };
    const firstMain = new FakeSourceNode();
    const firstSub = new FakeSourceNode();
    const secondMain = new FakeSourceNode();
    const secondSub = new FakeSourceNode();
    instrument.scheduleVoice([{ node: firstMain }], gain, {
      sub: { node: firstSub, gain },
    });
    instrument.scheduleVoice([{ node: secondMain }], gain, {
      sub: { node: secondSub, gain },
    });
    instrument.retire();

    firstMain.fireEnded();
    firstSub.fireEnded();
    expect(lfo.disconnect).toHaveBeenCalledTimes(2);
    expect(secondMain.disconnect).not.toHaveBeenCalled();
    expect(secondSub.disconnect).not.toHaveBeenCalled();

    secondMain.fireEnded();
    secondSub.fireEnded();
    expect(lfo.disconnect).toHaveBeenCalledTimes(5);
    expect(lfo.disconnect).toHaveBeenLastCalledWith();
  });

  it("detaches sub MIDI bindings per voice without affecting siblings", () => {
    vi.stubGlobal("GainNode", FakeGainNode);
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as BaseAudioContext,
      {} as never,
    );
    const signal = new FakeCcSignal();
    instrument.connectMidi({ in: { cc: vi.fn(() => signal) } } as never);
    const gain: AudioParamSchema = {
      type: "midi-cc",
      cc: 74,
      range: { min: 0, max: 1, curve: "linear" },
      default: 0,
    };
    const firstMain = new FakeSourceNode();
    const firstSub = new FakeSourceNode();
    const secondMain = new FakeSourceNode();
    const secondSub = new FakeSourceNode();
    instrument.scheduleVoice([{ node: firstMain }], undefined, {
      sub: { node: firstSub, gain },
    });
    instrument.scheduleVoice([{ node: secondMain }], undefined, {
      sub: { node: secondSub, gain },
    });

    expect(signal.subscriberCount).toBe(2);
    firstMain.fireEnded();
    firstSub.fireEnded();
    expect(signal.subscriberCount).toBe(1);
    expect(secondMain.disconnect).not.toHaveBeenCalled();
    expect(secondSub.disconnect).not.toHaveBeenCalled();

    secondMain.fireEnded();
    secondSub.fireEnded();
    expect(signal.subscriberCount).toBe(0);
    instrument.retire();
  });

  it("destroys a composed voice repeatedly without duplicating cleanup", () => {
    vi.stubGlobal("GainNode", FakeGainNode);
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as BaseAudioContext,
      {} as never,
    );
    const main = new FakeSourceNode();
    const sub = new FakeSourceNode();
    instrument.scheduleVoice([{ node: main }], undefined, {
      sub: {
        node: sub,
        gain: { type: "static", cycle: [[0.5]] },
      },
    });

    const mainStops = main.stop.mock.calls.length;
    const subStops = sub.stop.mock.calls.length;
    instrument.destroy();
    instrument.destroy();

    expect(main.stop).toHaveBeenCalledTimes(mainStops + 1);
    expect(sub.stop).toHaveBeenCalledTimes(subStops + 1);
    expect(main.disconnect).toHaveBeenCalledOnce();
    expect(sub.disconnect).toHaveBeenCalledOnce();
    expect(
      FakeGainNode.instances
        .slice(-2)
        .map((node) => node.disconnect.mock.calls.length),
    ).toEqual([1, 1]);
  });
});
