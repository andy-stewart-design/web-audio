import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BusSchema, RandomSchema, StaticSchema } from "@web-audio/schema";
import Bus from "./bus";

class FakeAudioParam {
  value = 0;
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
  setTargetAtTime = vi.fn();
  cancelScheduledValues = vi.fn();
  cancelAndHoldAtTime = vi.fn();
}

class FakeNode {
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeGainNode extends FakeNode {
  static instances: FakeGainNode[] = [];
  gain = new FakeAudioParam();

  constructor() {
    super();
    FakeGainNode.instances.push(this);
  }
}

class FakeFilterNode extends FakeNode {
  static instances: FakeFilterNode[] = [];
  frequency = new FakeAudioParam();
  Q = new FakeAudioParam();
  detune = new FakeAudioParam();
  gain = new FakeAudioParam();
  type: BiquadFilterType;

  constructor(_ctx: AudioContext, options: BiquadFilterOptions = {}) {
    super();
    this.type = options.type ?? "lowpass";
    FakeFilterNode.instances.push(this);
  }
}

class FakeWorkletNode extends FakeNode {
  static instances: FakeWorkletNode[] = [];
  parameters = new Map([
    ["outputA", new FakeAudioParam()],
    ["outputB", new FakeAudioParam()],
  ]);

  constructor() {
    super();
    FakeWorkletNode.instances.push(this);
  }
}

class FakeSignal {
  value = 0;
  hasValue = false;
  subscribe = vi.fn((callback: (value: number) => void) => {
    callback(this.value);
    return vi.fn();
  });
  channel() {
    return this;
  }
}

class FakeContext {
  currentTime = 4;
  gains: FakeGainNode[] = [];

  createGain() {
    const gain = new FakeGainNode();
    this.gains.push(gain);
    return gain;
  }
}

function staticParam(...values: number[]): StaticSchema {
  return {
    type: "static",
    polyphonic: false,
    cycle: values.map((value) => [
      { value, offset: 0, duration: 1, stepIndex: 0 },
    ]),
  };
}

function randomParam(): RandomSchema {
  return {
    type: "random",
    dataType: "float",
    segments: [{ seed: 42 }],
    quantValue: undefined,
    range: { min: 0, max: 1 },
    algorithm: "mulberry",
    grid: staticParam(1, 1),
  };
}

function setup(schema: BusSchema) {
  const ctx = new FakeContext();
  const destination = new FakeNode();
  const bus = new Bus(
    ctx as unknown as AudioContext,
    { barDuration: 2 } as never,
    {
      schema,
      destination: destination as unknown as AudioNode,
      startingBar: 0,
      barStartTime: 10,
    },
  );
  return { bus, ctx, destination };
}

beforeEach(() => {
  FakeGainNode.instances = [];
  FakeFilterNode.instances = [];
  FakeWorkletNode.instances = [];
  vi.stubGlobal("GainNode", FakeGainNode);
  vi.stubGlobal("BiquadFilterNode", FakeFilterNode);
  vi.stubGlobal("AudioWorkletNode", FakeWorkletNode);
});

describe("runtime Bus graph", () => {
  it("connects input through duck and output gain exactly once", () => {
    const { bus, ctx, destination } = setup({ gain: 0.75, effects: [] });
    const [input, duck, output] = ctx.gains;

    expect(bus.input).toBe(input);
    expect(input.connect).toHaveBeenCalledOnce();
    expect(input.connect).toHaveBeenCalledWith(duck);
    expect(duck.gain.value).toBe(1);
    expect(duck.connect).toHaveBeenCalledWith(output);
    expect(output.gain.value).toBe(0.75);
    expect(output.connect).toHaveBeenCalledWith(destination);
  });

  it("orders multiple effects before duck and output without a dry path", () => {
    const { ctx } = setup({
      gain: 1,
      effects: [
        {
          type: "filter",
          filterType: "lp",
          frequency: staticParam(800),
          q: staticParam(1),
          detune: staticParam(0),
          gain: staticParam(0),
        },
        { type: "gain", gain: staticParam(0.5) },
      ],
    });
    const [input, duck, output] = ctx.gains;
    const filter = FakeFilterNode.instances[0];
    const effectGain = FakeGainNode.instances[3];

    expect(input.connect).toHaveBeenCalledWith(filter);
    expect(input.connect).toHaveBeenCalledOnce();
    expect(filter.connect).toHaveBeenCalledWith(effectGain);
    expect(effectGain.connect).toHaveBeenCalledWith(duck);
    expect(duck.connect).toHaveBeenCalledWith(output);
  });

  it("initializes and updates static parameter cycles at bar boundaries", () => {
    const { bus } = setup({
      gain: 1,
      effects: [{ type: "gain", gain: staticParam(0.25, 0.75) }],
    });
    const effectGain = FakeGainNode.instances[3];

    expect(effectGain.gain.value).toBe(0.25);
    expect(effectGain.gain.setValueAtTime).toHaveBeenCalledWith(0.25, 10);
    bus.scheduleBar(1, 12);
    expect(effectGain.gain.setValueAtTime).toHaveBeenLastCalledWith(0.75, 12);
  });

  it("resolves random parameters deterministically for each bar", () => {
    const { bus } = setup({
      gain: 1,
      effects: [{ type: "gain", gain: randomParam() }],
    });
    const param = FakeGainNode.instances[3].gain;
    const initial = param.setValueAtTime.mock.calls[0][0];

    bus.scheduleBar(1, 12);
    bus.scheduleBar(0, 14);

    expect(param.setValueAtTime.mock.calls[2][0]).toBe(initial);
    expect(param.setValueAtTime.mock.calls[1][1]).toBe(12);
  });

  it("initializes MIDI parameters and owns their live binding", () => {
    const { bus } = setup({
      gain: 1,
      effects: [
        {
          type: "gain",
          gain: {
            type: "midi-cc",
            cc: 7,
            range: { min: 0, max: 1, curve: "linear" },
            default: 0.4,
          },
        },
      ],
    });
    const param = FakeGainNode.instances[3].gain;
    const signal = new FakeSignal();
    signal.value = 0.75;
    signal.hasValue = true;
    const cc = vi.fn(() => signal);

    expect(param.value).toBe(0.4);
    bus.connectMidi({ in: { cc } } as never);

    expect(cc).toHaveBeenCalledWith(7);
    expect(param.value).toBe(0.75);
    bus.destroy();
    expect(signal.subscribe.mock.results[0].value).toHaveBeenCalledOnce();
  });

  it("initializes persistent LFO parameters without native-default behavior", () => {
    const { bus } = setup({
      gain: 1,
      effects: [
        {
          type: "gain",
          gain: {
            type: "lfo",
            id: "gain-lfo",
            outputA: staticParam(0.2),
            outputB: staticParam(0.8),
            speed: [1],
            waveform: ["sine"],
            phase: 0,
            norm: false,
            invert: false,
          },
        },
      ],
    });
    const effectGain = FakeGainNode.instances[3];
    const lfo = FakeWorkletNode.instances[0];

    expect(effectGain.gain.value).toBe(0);
    expect(lfo.connect).toHaveBeenCalledWith(effectGain.gain);
    bus.scheduleBar(1, 12);
    expect(lfo.parameters.get("outputA")?.setValueAtTime).toHaveBeenCalledWith(
      0.2,
      12,
    );

    bus.destroy();
    expect(lfo.disconnect).toHaveBeenCalledWith(effectGain.gain);
    expect(lfo.disconnect).toHaveBeenCalledWith();
  });

  it("schedules bounded bus envelopes wholly inside each bar", () => {
    const { bus } = setup({
      gain: 1,
      effects: [
        {
          type: "gain",
          gain: {
            type: "envelope",
            min: 0,
            max: staticParam(1),
            a: staticParam(0.25),
            d: staticParam(0.25),
            s: staticParam(0.5),
            r: staticParam(0.25),
            mode: "bleed",
          },
        },
      ],
    });
    const param = FakeGainNode.instances[3].gain;

    expect(param.value).toBe(0);
    expect(param.cancelScheduledValues).toHaveBeenCalledWith(10);
    expect(param.setValueAtTime).toHaveBeenCalledWith(0, 10);
    expect(param.linearRampToValueAtTime).toHaveBeenCalledWith(1, 10.5);
    expect(param.linearRampToValueAtTime).toHaveBeenCalledWith(0, 12);

    bus.scheduleBar(1, 12);
    expect(param.cancelScheduledValues).toHaveBeenLastCalledWith(12);
    expect(param.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 14);
  });

  it("cancels future parameter, LFO, envelope, and duck automation on stop", () => {
    const { bus, ctx } = setup({
      gain: 0.6,
      effects: [
        { type: "gain", gain: staticParam(0.5, 0.75) },
        {
          type: "gain",
          gain: {
            type: "envelope",
            min: 0,
            max: staticParam(1),
            a: staticParam(0.1),
            d: staticParam(0.1),
            s: staticParam(0.5),
            r: staticParam(0.1),
            mode: "bounded",
          },
        },
        {
          type: "gain",
          gain: {
            type: "lfo",
            id: "stop-lfo",
            outputA: staticParam(0.2),
            outputB: staticParam(0.8),
            speed: [1],
            waveform: ["sine"],
            phase: 0,
            norm: false,
            invert: false,
          },
        },
      ],
    });
    const [, duck, output] = ctx.gains;
    const staticGain = FakeGainNode.instances[3].gain;
    const envelopeGain = FakeGainNode.instances[4].gain;
    const lfo = FakeWorkletNode.instances[0];
    bus.scheduleBar(1, 12);

    bus.stop();

    expect(staticGain.cancelScheduledValues).toHaveBeenCalledWith(4);
    expect(envelopeGain.cancelAndHoldAtTime).toHaveBeenCalledWith(4);
    expect(envelopeGain.linearRampToValueAtTime).toHaveBeenLastCalledWith(
      0,
      4.0025,
    );
    expect(
      lfo.parameters.get("outputA")?.cancelScheduledValues,
    ).toHaveBeenCalledWith(4);
    expect(duck.gain.cancelAndHoldAtTime).toHaveBeenCalledWith(4);
    expect(duck.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(
      1,
      4.0025,
    );
    expect(output.gain.cancelScheduledValues).not.toHaveBeenCalled();
    expect(output.gain.setValueAtTime).not.toHaveBeenCalled();
  });

  it("destroys all owned nodes and automation idempotently", () => {
    const { bus, ctx } = setup({
      gain: 1,
      effects: [{ type: "gain", gain: staticParam(0.5) }],
    });
    const effectGain = FakeGainNode.instances[3];

    bus.destroy();
    bus.destroy();

    for (const node of [...ctx.gains, effectGain]) {
      expect(node.disconnect).toHaveBeenCalledOnce();
    }
  });
});
