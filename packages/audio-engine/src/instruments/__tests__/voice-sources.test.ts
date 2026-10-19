import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  EventScheduleContext,
  ResolvedEnvelopeSchema,
  ScheduledSource,
} from "@/types";
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
  readonly gain = {
    value: 1,
    setValueAtTime: vi.fn(() => {
      if (FakeGainNode.failSetValue) throw FakeGainNode.failSetValue;
    }),
    linearRampToValueAtTime: vi.fn(),
  };
  readonly connect = vi.fn();
  static failSetValue: Error | undefined;

  constructor() {
    super();
    FakeGainNode.instances.push(this);
  }
}

class FakeAudioContext {
  readonly currentTime = 0;
  readonly destination = {} as AudioNode;

  createGain() {
    return new FakeGainNode() as unknown as GainNode;
  }
}

class TestInstrument extends Instrument {
  scheduleBar() {}

  scheduleVoice(
    sources: [{ node: FakeSourceNode }, ...{ node: FakeSourceNode }[]],
  ) {
    this._scheduleVoice({
      sources,
      event: eventContext(),
      gainEnvelope: resolvedEnvelope(),
      effects: [],
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
  FakeGainNode.failSetValue = undefined;
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

    expect(() => instrument.scheduleVoice([{ node: source }])).toThrow(error);
    expect(source.disconnect).toHaveBeenCalledOnce();
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
    expect(second.stop).not.toHaveBeenCalled();
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

  it("releases a node created before partial parameter setup fails", () => {
    vi.stubGlobal("GainNode", FakeGainNode);
    const error = new Error("parameter setup failed");
    FakeGainNode.failSetValue = error;
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as BaseAudioContext,
      {} as never,
    );
    const source = new FakeSourceNode();

    expect(() => instrument.scheduleVoice([{ node: source }])).toThrow(error);
    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(FakeGainNode.instances.at(-1)?.disconnect).toHaveBeenCalledOnce();
  });
});
