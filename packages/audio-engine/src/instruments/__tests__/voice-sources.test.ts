import { describe, expect, it, vi } from "vitest";
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

class FakeAudioNode {
  readonly disconnect = vi.fn();
}

class FakeGainNode extends FakeAudioNode {
  readonly gain = { value: 1 };
  readonly connect = vi.fn();
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

  track(
    sourceNodes: FakeSourceNode[],
    audioNodes: FakeAudioNode[],
    completionCleanups: (() => void)[] = [],
  ) {
    this._track(
      sourceNodes,
      audioNodes as unknown as AudioNode[],
      0,
      completionCleanups,
    );
  }
}

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
});
