import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DromeSchema } from "@web-audio/schema";
import { createManualClock } from "./support/manual-clock";
import AudioEngine from "../index";
import {
  defaultSynthSchema,
  staticNumberPattern,
} from "../test-utils/schema-fixtures";

class FakeAudioParam {
  value = 0;
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
  cancelAndHoldAtTime = vi.fn();
}

class FakeAudioNode {
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
}

class FakeGainNode extends FakeAudioNode {
  static instances: FakeGainNode[] = [];
  readonly gain = new FakeAudioParam();

  constructor() {
    super();
    FakeGainNode.instances.push(this);
  }
}

class FakeFilterNode extends FakeAudioNode {
  static instances: FakeFilterNode[] = [];
  readonly frequency = new FakeAudioParam();
  readonly Q = new FakeAudioParam();
  readonly detune = new FakeAudioParam();
  readonly gain = new FakeAudioParam();

  constructor(
    _ctx: AudioContext,
    readonly options: BiquadFilterOptions,
  ) {
    super();
    FakeFilterNode.instances.push(this);
  }
}

class FakeOscillatorNode extends FakeAudioNode {
  static instances: FakeOscillatorNode[] = [];
  readonly detune = new FakeAudioParam();
  onended: (() => void) | null = null;
  readonly start = vi.fn();
  readonly stop = vi.fn();

  constructor(
    _ctx: AudioContext,
    readonly options: OscillatorOptions,
  ) {
    super();
    FakeOscillatorNode.instances.push(this);
  }

  fireEnded() {
    this.onended?.();
  }
}

class FakeAudioContext {
  currentTime = 0;
  destination = new FakeAudioNode();
  audioWorklet = { addModule: vi.fn(async () => undefined) };
  readonly gains: FakeGainNode[] = [];
  readonly analyser = new FakeAudioNode();

  createGain() {
    const gain = new FakeGainNode();
    this.gains.push(gain);
    return gain;
  }

  createAnalyser() {
    return this.analyser;
  }

  decodeAudioData = vi.fn(async () => ({ duration: 1 }) as AudioBuffer);
}

function schema(): DromeSchema {
  return {
    bpm: undefined,
    instruments: [
      defaultSynthSchema({
        route: "drums",
        sends: { verb: 0.25 },
        ducks: {
          drums: { depth: 0.25, onset: 0.2, recovery: 0.5 },
        },
        effects: [
          {
            type: "filter",
            filterType: "lp",
            frequency: staticNumberPattern([800]),
            q: staticNumberPattern([2]),
            detune: staticNumberPattern([0]),
            gain: staticNumberPattern([0]),
          },
        ],
      }),
    ],
    banks: {},
    buses: {
      drums: { gain: 0.75, transition: 0, effects: [] },
      verb: { gain: 1, transition: 0, effects: [] },
    },
  };
}

function target(node: FakeAudioNode) {
  return node.connect.mock.calls[0]?.[0] as FakeAudioNode;
}

beforeEach(() => {
  FakeGainNode.instances = [];
  FakeFilterNode.instances = [];
  FakeOscillatorNode.instances = [];
  vi.stubGlobal("GainNode", FakeGainNode);
  vi.stubGlobal("BiquadFilterNode", FakeFilterNode);
  vi.stubGlobal("OscillatorNode", FakeOscillatorNode);
});

afterEach(() => vi.unstubAllGlobals());

describe("real effected engine composition", () => {
  it("preserves voice, named-bus, send, duck, and retirement boundaries", async () => {
    const ctx = new FakeAudioContext();
    const driver = createManualClock(ctx as never);
    const engine = new AudioEngine(
      ctx as unknown as BaseAudioContext,
      driver.clock,
    );
    await engine.ready;

    try {
      engine.update(schema());
      driver.emit("prebar", 0, 10);
      driver.emit("bar", 0, 10);

      const oldSource = FakeOscillatorNode.instances[0];
      const voiceFilter = FakeFilterNode.instances[0];
      const envelope = target(voiceFilter);
      const balancing = target(envelope);
      const mute = target(balancing);
      const primary = mute.connect.mock.calls[0][0] as FakeAudioNode;
      const send = mute.connect.mock.calls[1][0] as FakeAudioNode;

      expect(oldSource.connect).toHaveBeenCalledOnce();
      expect(oldSource.connect).toHaveBeenCalledWith(voiceFilter);
      expect(voiceFilter.connect).toHaveBeenCalledWith(envelope);
      expect(envelope.connect).toHaveBeenCalledWith(balancing);
      expect(balancing.connect).toHaveBeenCalledWith(mute);
      expect(mute.connect).toHaveBeenCalledTimes(2);
      expect(mute.connect).toHaveBeenCalledWith(primary);
      expect(mute.connect).toHaveBeenCalledWith(send);
      expect(primary).not.toBe(send);
      expect(ctx.gains[2].gain.setValueAtTime).toHaveBeenCalledWith(1, 10);

      engine.update(schema());
      driver.emit("prebar", 1, 12);
      expect(oldSource.disconnect).not.toHaveBeenCalled();
      driver.emit("bar", 1, 12);
      const newSource = FakeOscillatorNode.instances[1];
      expect(newSource).not.toBe(oldSource);
      expect(newSource.connect).toHaveBeenCalledWith(
        FakeFilterNode.instances[1],
      );
      expect(oldSource.disconnect).not.toHaveBeenCalled();

      oldSource.fireEnded();
      await Promise.resolve();
      await Promise.resolve();
      expect(oldSource.disconnect).toHaveBeenCalledOnce();
      expect(newSource.disconnect).not.toHaveBeenCalled();
    } finally {
      engine.destroy();
    }
  });
});
