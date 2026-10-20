import type AudioClock from "@web-audio/clock";
import type {
  BasicSynthesizerSchema,
  EffectSchema,
  EnvelopeSchema,
  SamplerSchema,
  TimingPattern,
} from "@web-audio/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultSamplerSchema,
  defaultSynthSchema,
  fileBank,
  staticNumberPattern,
} from "../../__tests__/support/schema-fixtures";
import SampleBufferCache from "../../samples/sample-buffer-cache";
import Sampler from "../sampler";
import Synthesizer from "../synthesizer";

class FakeAudioParam {
  value = 0;
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
}

class FakeGainNode {
  static instances: FakeGainNode[] = [];
  readonly gain = new FakeAudioParam();
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
  role: "output" | "voice" = "voice";

  constructor() {
    FakeGainNode.instances.push(this);
  }
}

class FakeFilterNode {
  static instances: FakeFilterNode[] = [];
  readonly frequency = new FakeAudioParam();
  readonly Q = new FakeAudioParam();
  readonly detune = new FakeAudioParam();
  readonly gain = new FakeAudioParam();
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();

  constructor() {
    FakeFilterNode.instances.push(this);
  }
}

class FakeOscillatorNode {
  static instances: FakeOscillatorNode[] = [];
  readonly detune = new FakeAudioParam();
  onended: (() => void) | null = null;
  readonly start = vi.fn();
  readonly stop = vi.fn();
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();

  constructor() {
    FakeOscillatorNode.instances.push(this);
  }

  fireEnded() {
    this.onended?.();
  }
}

class FakeBufferSourceNode {
  static instances: FakeBufferSourceNode[] = [];
  readonly detune = new FakeAudioParam();
  onended: (() => void) | null = null;
  readonly start = vi.fn();
  readonly stop = vi.fn();
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();

  constructor() {
    FakeBufferSourceNode.instances.push(this);
  }
}

class FakeAudioContext {
  currentTime = 0;
  destination = {};
  readonly gains: FakeGainNode[] = [];

  createGain() {
    const gain = new FakeGainNode();
    gain.role = "output";
    this.gains.push(gain);
    return gain;
  }
}

const timing = (
  cycle: TimingPattern["cycle"] = [[{ offset: 0, duration: 1 }]],
): TimingPattern => ({ cycle });

function envelope(): EnvelopeSchema {
  return {
    type: "envelope",
    min: 0,
    max: staticNumberPattern([1]),
    a: staticNumberPattern([0]),
    d: staticNumberPattern([0]),
    s: staticNumberPattern([1]),
    r: staticNumberPattern([0]),
    mode: "bleed",
  };
}

function filterEffect(frequency = 800): EffectSchema {
  return {
    type: "filter",
    filterType: "lp",
    frequency: staticNumberPattern([frequency]),
    q: staticNumberPattern([2]),
    detune: staticNumberPattern([0]),
    gain: staticNumberPattern([0]),
  };
}

function gainEffect(value = 0.5): EffectSchema {
  return {
    type: "gain",
    gain: staticNumberPattern([value]),
  };
}

function effectPair(reversed: boolean): EffectSchema[] {
  return reversed
    ? [gainEffect(), filterEffect()]
    : [filterEffect(), gainEffect()];
}

function synthSchema(
  overrides: Partial<BasicSynthesizerSchema> = {},
): BasicSynthesizerSchema {
  return defaultSynthSchema({
    gain: envelope(),
    ...overrides,
  });
}

function samplerSchema(overrides: Partial<SamplerSchema> = {}): SamplerSchema {
  return defaultSamplerSchema({
    gain: envelope(),
    ...overrides,
  });
}

function createSynth(ctx: FakeAudioContext, schema: BasicSynthesizerSchema) {
  return new Synthesizer(
    ctx as unknown as AudioContext,
    { barDuration: 2 } as AudioClock,
    { schema },
  );
}

function createSampler(ctx: FakeAudioContext, schema: SamplerSchema) {
  const cache = new SampleBufferCache(ctx as unknown as BaseAudioContext);
  vi.spyOn(cache, "get").mockReturnValue({ duration: 4 } as AudioBuffer);
  return new Sampler(
    ctx as unknown as AudioContext,
    { barDuration: 2 } as AudioClock,
    { schema, banks: fileBank(), cache },
  );
}

function voiceEnvelopes(ctx: FakeAudioContext) {
  return FakeGainNode.instances.filter(
    (node) =>
      node.role === "voice" &&
      node.connect.mock.calls.some(
        ([destination]) => destination === ctx.gains[0],
      ),
  );
}

beforeEach(() => {
  FakeGainNode.instances = [];
  FakeFilterNode.instances = [];
  FakeOscillatorNode.instances = [];
  FakeBufferSourceNode.instances = [];
  vi.stubGlobal("GainNode", FakeGainNode);
  vi.stubGlobal("BiquadFilterNode", FakeFilterNode);
  vi.stubGlobal("OscillatorNode", FakeOscillatorNode);
  vi.stubGlobal("AudioBufferSourceNode", FakeBufferSourceNode);
});

afterEach(() => vi.unstubAllGlobals());

describe("pre-envelope voice topology", () => {
  it.each([false, true])(
    "preserves authored effect order before the envelope (reversed=%s)",
    (reversed) => {
      const ctx = new FakeAudioContext();
      const instance = createSynth(
        ctx,
        synthSchema({ effects: effectPair(reversed) }),
      );

      instance.scheduleBar(0, 10);

      const source = FakeOscillatorNode.instances[0];
      const filter = FakeFilterNode.instances[0];
      const envelopeNode = voiceEnvelopes(ctx)[0];
      const effectGain = FakeGainNode.instances.find(
        (node) => node.role === "voice" && node !== envelopeNode,
      );
      expect(effectGain).toBeDefined();

      const first = reversed ? effectGain : filter;
      const second = reversed ? filter : effectGain;
      expect(source.connect).toHaveBeenCalledOnce();
      expect(source.connect).toHaveBeenCalledWith(first);
      expect(source.connect).not.toHaveBeenCalledWith(envelopeNode);
      expect(first?.connect).toHaveBeenCalledOnce();
      expect(first?.connect).toHaveBeenCalledWith(second);
      expect(second?.connect).toHaveBeenCalledOnce();
      expect(second?.connect).toHaveBeenCalledWith(envelopeNode);
      expect(envelopeNode.connect).toHaveBeenCalledOnce();
      expect(envelopeNode.connect).toHaveBeenCalledWith(ctx.gains[0]);
    },
  );

  it("connects a synth source directly to its envelope when effects are empty", () => {
    const ctx = new FakeAudioContext();
    const instance = createSynth(ctx, synthSchema());

    instance.scheduleBar(0, 10);

    const source = FakeOscillatorNode.instances[0];
    const envelopeNode = voiceEnvelopes(ctx)[0];
    expect(FakeFilterNode.instances).toHaveLength(0);
    expect(source.connect).toHaveBeenCalledOnce();
    expect(source.connect).toHaveBeenCalledWith(envelopeNode);
    expect(envelopeNode.connect).toHaveBeenCalledWith(ctx.gains[0]);
  });

  it("connects a sampler source directly to its envelope when effects are empty", () => {
    const ctx = new FakeAudioContext();
    const instance = createSampler(ctx, samplerSchema());

    instance.scheduleBar(0, 10);

    const source = FakeBufferSourceNode.instances[0];
    const envelopeNode = voiceEnvelopes(ctx)[0];
    expect(FakeFilterNode.instances).toHaveLength(0);
    expect(source.connect).toHaveBeenCalledOnce();
    expect(source.connect).toHaveBeenCalledWith(envelopeNode);
    expect(envelopeNode.connect).toHaveBeenCalledWith(ctx.gains[0]);
  });

  it("keeps chord synth voices on separate effect and envelope paths", () => {
    const ctx = new FakeAudioContext();
    const instance = createSynth(
      ctx,
      synthSchema({
        effects: [filterEffect()],
        eventPattern: {
          timing: timing(),
          notes: { type: "static", cycle: [[[60, 64]]] },
        },
      }),
    );

    instance.scheduleBar(0, 10);

    const sources = FakeOscillatorNode.instances;
    const filters = FakeFilterNode.instances;
    const envelopes = voiceEnvelopes(ctx);
    expect(sources).toHaveLength(2);
    expect(filters).toHaveLength(2);
    expect(envelopes).toHaveLength(2);
    expect(sources[0].connect).toHaveBeenCalledWith(filters[0]);
    expect(sources[1].connect).toHaveBeenCalledWith(filters[1]);
    expect(filters[0].connect).toHaveBeenCalledWith(envelopes[0]);
    expect(filters[1].connect).toHaveBeenCalledWith(envelopes[1]);
    expect(filters[0].connect).not.toHaveBeenCalledWith(envelopes[1]);
    expect(filters[1].connect).not.toHaveBeenCalledWith(envelopes[0]);
    expect(envelopes[0]).not.toBe(envelopes[1]);
  });

  it("keeps layered sampler voices on separate effect and envelope paths", () => {
    const ctx = new FakeAudioContext();
    const instance = createSampler(
      ctx,
      samplerSchema({
        effects: [filterEffect()],
        eventPattern: {
          timing: timing(),
          notes: { type: "static", cycle: [[[60, 64]]] },
          sampleNames: { type: "static", cycle: [[["bd"]]] },
        },
      }),
    );

    instance.scheduleBar(0, 10);

    const sources = FakeBufferSourceNode.instances;
    const filters = FakeFilterNode.instances;
    const envelopes = voiceEnvelopes(ctx);
    expect(sources).toHaveLength(2);
    expect(filters).toHaveLength(2);
    expect(envelopes).toHaveLength(2);
    expect(sources[0].connect).toHaveBeenCalledWith(filters[0]);
    expect(sources[1].connect).toHaveBeenCalledWith(filters[1]);
    expect(filters[0].connect).toHaveBeenCalledWith(envelopes[0]);
    expect(filters[1].connect).toHaveBeenCalledWith(envelopes[1]);
    expect(filters[0].connect).not.toHaveBeenCalledWith(envelopes[1]);
    expect(filters[1].connect).not.toHaveBeenCalledWith(envelopes[0]);
  });
});

describe("pre-envelope voice lifecycle", () => {
  it("cleans only the ended voice and preserves the surviving effected voice", () => {
    const ctx = new FakeAudioContext();
    const instance = createSynth(
      ctx,
      synthSchema({
        effects: [filterEffect()],
        eventPattern: {
          timing: timing(),
          notes: { type: "static", cycle: [[[60, 64]]] },
        },
      }),
    );

    instance.scheduleBar(0, 10);
    const firstSource = FakeOscillatorNode.instances[0];
    const secondSource = FakeOscillatorNode.instances[1];
    const filters = FakeFilterNode.instances;
    const envelopes = voiceEnvelopes(ctx);

    firstSource.fireEnded();
    expect(firstSource.disconnect).toHaveBeenCalledOnce();
    expect(filters[0].disconnect).toHaveBeenCalledOnce();
    expect(envelopes[0].disconnect).toHaveBeenCalledOnce();
    expect(secondSource.disconnect).not.toHaveBeenCalled();
    expect(filters[1].disconnect).not.toHaveBeenCalled();
    expect(envelopes[1].disconnect).not.toHaveBeenCalled();

    ctx.currentTime = 10;
    const scheduledStopCalls = secondSource.stop.mock.calls.length;
    instance.cancelFutureNotes();
    expect(secondSource.stop.mock.calls).toHaveLength(scheduledStopCalls);
    secondSource.fireEnded();
    expect(secondSource.disconnect).toHaveBeenCalledOnce();
    expect(filters[1].disconnect).toHaveBeenCalledOnce();
  });
});
