import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EffectSchema, StaticSchema } from "@web-audio/schema";
import RuntimeBus from "./runtime-bus";

class FakeAudioParam {
  value = 99;
}

class FakeGainNode {
  gain = new FakeAudioParam();
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeEffectGainNode extends FakeGainNode {
  static instances: FakeEffectGainNode[] = [];

  constructor() {
    super();
    FakeEffectGainNode.instances.push(this);
  }
}

class FakeFilterNode {
  static instances: FakeFilterNode[] = [];
  type: BiquadFilterType;
  frequency = new FakeAudioParam();
  Q = new FakeAudioParam();
  detune = new FakeAudioParam();
  gain = new FakeAudioParam();
  connect = vi.fn();
  disconnect = vi.fn();

  constructor(_ctx: AudioContext, options: BiquadFilterOptions = {}) {
    this.type = options.type ?? "lowpass";
    FakeFilterNode.instances.push(this);
  }
}

function staticParam(value: number): StaticSchema {
  return {
    type: "static",
    polyphonic: false,
    cycle: [[{ value, offset: 0, duration: 1, stepIndex: 0 }]],
  };
}

function createBus(effects: EffectSchema[] = []) {
  const gains: FakeGainNode[] = [];
  const ctx = {
    createGain: () => {
      const gain = new FakeGainNode();
      gains.push(gain);
      return gain;
    },
  } as unknown as AudioContext;
  const main = new FakeGainNode();
  const bus = new RuntimeBus(
    ctx,
    "drums",
    { gain: 0.75, effects },
    main as unknown as AudioNode,
  );
  return { bus, gains, main };
}

beforeEach(() => {
  FakeEffectGainNode.instances = [];
  FakeFilterNode.instances = [];
  vi.stubGlobal("GainNode", FakeEffectGainNode);
  vi.stubGlobal("BiquadFilterNode", FakeFilterNode);
});

describe("RuntimeBus", () => {
  it("connects an empty chain directly through output gain to main", () => {
    const { bus, gains, main } = createBus();
    const [input, output] = gains;

    expect(bus.input).toBe(input);
    expect(input.connect).toHaveBeenCalledOnce();
    expect(input.connect).toHaveBeenCalledWith(output);
    expect(output.gain.value).toBe(0.75);
    expect(output.connect).toHaveBeenCalledWith(main);
  });

  it("initializes and serially connects gain and filter effects", () => {
    const { gains, main } = createBus([
      { type: "gain", gain: staticParam(0.5) },
      {
        type: "filter",
        filterType: "hp",
        frequency: staticParam(800),
        q: staticParam(2),
        detune: staticParam(3),
        gain: staticParam(4),
      },
    ]);
    const [input, output] = gains;
    const effectGain = FakeEffectGainNode.instances[0];
    const filter = FakeFilterNode.instances[0];

    expect(effectGain.gain.value).toBe(0.5);
    expect(filter.type).toBe("highpass");
    expect(filter.frequency.value).toBe(800);
    expect(filter.Q.value).toBe(2);
    expect(filter.detune.value).toBe(3);
    expect(filter.gain.value).toBe(4);
    expect(input.connect).toHaveBeenCalledWith(effectGain);
    expect(effectGain.connect).toHaveBeenCalledWith(filter);
    expect(filter.connect).toHaveBeenCalledWith(output);
    expect(output.connect).toHaveBeenCalledWith(main);
    expect(input.connect).toHaveBeenCalledOnce();
  });

  it("rejects dynamic parameters with their bus effect path", () => {
    expect(() =>
      createBus([
        {
          type: "gain",
          gain: {
            ...staticParam(0.5),
            cycle: [
              [{ value: 0.5, offset: 0, duration: 1, stepIndex: 0 }],
              [{ value: 1, offset: 0, duration: 1, stepIndex: 0 }],
            ],
          },
        },
      ]),
    ).toThrow(
      '[AudioEngine] Bus "drums" effects[0].gain must be one finite constant static value.',
    );
  });

  it("destroys every owned node idempotently", () => {
    const { bus, gains } = createBus([
      { type: "gain", gain: staticParam(0.5) },
    ]);

    bus.destroy();
    bus.destroy();

    expect(gains[0].disconnect).toHaveBeenCalledOnce();
    expect(FakeEffectGainNode.instances[0].disconnect).toHaveBeenCalledOnce();
    expect(gains[1].disconnect).toHaveBeenCalledOnce();
  });
});
