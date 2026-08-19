import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EffectSchema, StaticSchema } from "@web-audio/schema";
import ParameterManager from "@/automation/parameter-manager";
import { buildEffectChain } from "./effect-chain";

class FakeAudioParam {
  value = 0;
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
}

class FakeAudioNode {
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeGainNode extends FakeAudioNode {
  static instances: FakeGainNode[] = [];
  gain = new FakeAudioParam();

  constructor() {
    super();
    FakeGainNode.instances.push(this);
  }
}

class FakeFilterNode extends FakeAudioNode {
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

function staticParam(value: number): StaticSchema {
  return {
    type: "static",
    polyphonic: false,
    cycle: [[{ value, offset: 0, duration: 1, stepIndex: 0 }]],
  };
}

function filterEffect(): EffectSchema {
  return {
    type: "filter",
    filterType: "hp",
    frequency: staticParam(800),
    q: staticParam(2),
    detune: staticParam(3),
    gain: staticParam(4),
  };
}

function gainEffect(): EffectSchema {
  return { type: "gain", gain: staticParam(0.5) };
}

function setup(effects: EffectSchema[]) {
  const ctx = {} as AudioContext;
  const input = new FakeAudioNode();
  const output = new FakeAudioNode();
  const parameters = new ParameterManager(ctx, { barDuration: 2 } as never);
  const cleanups: (() => void)[] = [];
  const nodes = buildEffectChain({
    ctx,
    input: input as unknown as AudioNode,
    output: output as unknown as AudioNode,
    effects,
    parameters,
    context: {
      barIndex: 0,
      stepIndex: 0,
      startTime: 10,
      duration: 1,
      endTime: 11,
    },
    cleanups,
  });
  return { input, output, nodes, cleanups };
}

beforeEach(() => {
  FakeGainNode.instances = [];
  FakeFilterNode.instances = [];
  vi.stubGlobal("GainNode", FakeGainNode);
  vi.stubGlobal("BiquadFilterNode", FakeFilterNode);
});

describe("buildEffectChain", () => {
  it("connects an empty chain directly without a duplicate path", () => {
    const { input, output, nodes } = setup([]);

    expect(nodes).toEqual([]);
    expect(input.connect).toHaveBeenCalledOnce();
    expect(input.connect).toHaveBeenCalledWith(output);
  });

  it("constructs and returns owned nodes in serial effect order", () => {
    const { input, output, nodes } = setup([
      filterEffect(),
      gainEffect(),
      filterEffect(),
    ]);
    const [firstFilter, gain, secondFilter] = nodes;

    expect(nodes).toEqual([
      FakeFilterNode.instances[0],
      FakeGainNode.instances[0],
      FakeFilterNode.instances[1],
    ]);
    expect(input.connect).toHaveBeenCalledWith(firstFilter);
    expect(firstFilter.connect).toHaveBeenCalledWith(gain);
    expect(gain.connect).toHaveBeenCalledWith(secondFilter);
    expect(secondFilter.connect).toHaveBeenCalledWith(output);
    expect(input.connect).toHaveBeenCalledOnce();
  });

  it("maps filter types and applies every filter parameter", () => {
    setup([filterEffect()]);
    const filter = FakeFilterNode.instances[0];

    expect(filter.type).toBe("highpass");
    expect(filter.frequency.setValueAtTime).toHaveBeenCalledWith(800, 10);
    expect(filter.Q.setValueAtTime).toHaveBeenCalledWith(2, 10);
    expect(filter.detune.setValueAtTime).toHaveBeenCalledWith(3, 10);
    expect(filter.gain.setValueAtTime).toHaveBeenCalledWith(4, 10);
  });

  it("applies gain parameters through the shared manager", () => {
    setup([gainEffect()]);

    expect(FakeGainNode.instances[0].gain.setValueAtTime).toHaveBeenCalledWith(
      0.5,
      10,
    );
  });

  it("fails explicitly for unsupported runtime effect types", () => {
    const unsupported = { type: "reverb" } as unknown as EffectSchema;

    expect(() => setup([unsupported])).toThrow("Unsupported effect type");
  });
});
