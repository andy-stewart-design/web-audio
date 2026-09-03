import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EffectSchema } from "@web-audio/schema";
import RuntimeBus from "./runtime-bus";
import {
  randomNumberPattern,
  staticNumberBars,
} from "../test-utils/schema-fixtures";

class FakeAudioParam {
  value = 99;
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
  cancelAndHoldAtTime = vi.fn();
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

const staticParam = staticNumberBars;

function randomParam(
  overrides: Parameters<typeof randomNumberPattern>[0] = {},
) {
  return randomNumberPattern({
    segments: [{ seed: 42 }],
    range: { min: 0.25, max: 0.75 },
    algorithm: "mulberry",
    ...overrides,
  });
}

function createBus(
  effects: EffectSchema[] = [],
  options?: {
    startingBar: number;
    barStartTime: number | undefined;
  },
  transition = 0,
) {
  const gains: FakeGainNode[] = [];
  const ctx = {
    currentTime: 0,
    createGain: () => {
      const gain = new FakeGainNode();
      gains.push(gain);
      return gain;
    },
  } as unknown as AudioContext;
  const main = new FakeGainNode();
  const bus = new RuntimeBus(
    ctx,
    { gain: 0.75, transition, effects },
    main as unknown as AudioNode,
    options,
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

  it("initializes the requested starting bar without rebuilding nodes", () => {
    const gain = {
      ...staticParam(0.5),
      cycle: [
        [{ value: 0.5, offset: 0, duration: 1, stepIndex: 0 }],
        [{ value: 1, offset: 0, duration: 1, stepIndex: 0 }],
      ],
    };
    createBus([{ type: "gain", gain }], {
      startingBar: 3,
      barStartTime: undefined,
    });

    expect(FakeEffectGainNode.instances).toHaveLength(1);
    expect(FakeEffectGainNode.instances[0].gain.value).toBe(1);
  });

  it("schedules static cycles at exact bar times using step zero", () => {
    const gain = {
      ...staticParam(0.5),
      cycle: [
        [
          { value: 0.5, offset: 0, duration: 0.5, stepIndex: 0 },
          { value: 99, offset: 0.5, duration: 0.5, stepIndex: 1 },
        ],
        [{ value: 1, offset: 0, duration: 1, stepIndex: 0 }],
      ],
    };
    const { bus } = createBus([{ type: "gain", gain }]);
    const target = FakeEffectGainNode.instances[0].gain;

    bus.scheduleBar(1, 12);
    bus.scheduleBar(2, 14);

    expect(target.setValueAtTime.mock.calls).toEqual([
      [0.5, 12],
      [1, 14],
    ]);
    expect(target.linearRampToValueAtTime.mock.calls).toEqual([
      [1, 12.01],
      [0.5, 14.01],
    ]);
    expect(FakeEffectGainNode.instances).toHaveLength(1);
  });

  it("does not schedule an identical bar and time twice", () => {
    const { bus } = createBus([{ type: "gain", gain: staticParam(0.5) }], {
      startingBar: 2,
      barStartTime: 10,
    });
    const target = FakeEffectGainNode.instances[0].gain;

    bus.scheduleBar(2, 10);
    bus.scheduleBar(3, 12);

    expect(target.setValueAtTime.mock.calls).toEqual([[0.5, 10]]);
    expect(target.linearRampToValueAtTime).not.toHaveBeenCalled();
  });

  it("uses a full minimum ramp when scheduling arrives late", () => {
    const { bus } = createBus([{ type: "gain", gain: staticParam(1, 0.5) }]);
    const target = FakeEffectGainNode.instances[0].gain;

    bus.scheduleBar(1, -1);

    expect(target.setValueAtTime).toHaveBeenCalledWith(1, 0);
    expect(target.linearRampToValueAtTime).toHaveBeenCalledWith(0.5, 0.01);
  });

  it("transitions over the configured fraction of a bar", () => {
    const { bus } = createBus(
      [{ type: "gain", gain: staticParam(1, 0.5) }],
      { startingBar: 0, barStartTime: undefined },
      0.25,
    );
    const target = FakeEffectGainNode.instances[0].gain;

    bus.scheduleBar(1, 10, 2);

    expect(target.setValueAtTime).toHaveBeenCalledWith(1, 10);
    expect(target.linearRampToValueAtTime).toHaveBeenCalledWith(0.5, 10.5);
  });

  it("resolves every binding before scheduling any target", () => {
    const valid = staticParam(0.5);
    const invalid = staticParam(800);
    const { bus } = createBus([
      { type: "gain", gain: valid },
      {
        type: "filter",
        filterType: "lp",
        frequency: invalid,
        q: staticParam(1),
        detune: staticParam(0),
        gain: staticParam(0),
      },
    ]);
    const gainTarget = FakeEffectGainNode.instances[0].gain;
    invalid.cycle = [];

    expect(() => bus.scheduleBar(1, 12)).toThrow(
      "[RuntimeBus] Expected a validated bus parameter.",
    );
    expect(gainTarget.setValueAtTime).not.toHaveBeenCalled();
  });

  it("resolves deterministic random values by bar using step zero", () => {
    const schema = randomParam({
      grid: {
        ...staticParam(1),
        cycle: [
          [
            { value: 0, offset: 0, duration: 0.5, stepIndex: 0 },
            { value: 1, offset: 0.5, duration: 0.5, stepIndex: 1 },
          ],
          [{ value: 1, offset: 0, duration: 1, stepIndex: 0 }],
        ],
      },
    });
    const first = createBus([{ type: "gain", gain: schema }]);
    const firstTarget = FakeEffectGainNode.instances[0].gain;

    expect(firstTarget.value).toBe(0);
    first.bus.scheduleBar(1, 10);
    const resolved = firstTarget.linearRampToValueAtTime.mock.calls[0][0];
    expect(resolved).toBeGreaterThanOrEqual(0.25);
    expect(resolved).toBeLessThanOrEqual(0.75);

    createBus([{ type: "gain", gain: structuredClone(schema) }], {
      startingBar: 1,
      barStartTime: undefined,
    });
    expect(FakeEffectGainNode.instances[1].gain.value).toBe(resolved);
  });

  it("does not partially initialize a mixed static and invalid random chain", () => {
    expect(() =>
      createBus([
        { type: "gain", gain: staticParam(0.5) },
        {
          type: "filter",
          filterType: "lp",
          frequency: randomParam({ valueMap: [] }),
          q: staticParam(1),
          detune: staticParam(0),
          gain: staticParam(0),
        },
      ]),
    ).toThrow("[RuntimeBus] Expected a validated bus parameter.");

    expect(FakeEffectGainNode.instances[0].gain.value).toBe(99);
  });

  it("guards against an unvalidated unsupported parameter", () => {
    expect(() =>
      createBus([
        {
          type: "gain",
          gain: { type: "lfo" } as never,
        },
      ]),
    ).toThrow("[RuntimeBus] Expected a validated bus parameter.");
  });

  it("holds the exact in-progress value when stopped mid-transition", () => {
    const { bus } = createBus(
      [{ type: "gain", gain: staticParam(1, 0.5) }],
      undefined,
      0.25,
    );
    const target = FakeEffectGainNode.instances[0].gain;

    bus.scheduleBar(1, 10, 2);
    bus.stop(10.25);

    expect(target.cancelAndHoldAtTime).toHaveBeenCalledWith(10.25);

    bus.scheduleBar(1, 20, 2);

    expect(target.setValueAtTime).toHaveBeenLastCalledWith(0.75, 20);
    expect(target.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.5, 20.5);
  });

  it("holds the source value when stopped before a future transition", () => {
    const { bus } = createBus(
      [{ type: "gain", gain: staticParam(1, 0.5) }],
      undefined,
      0.25,
    );
    const target = FakeEffectGainNode.instances[0].gain;

    bus.scheduleBar(1, 10, 2);
    bus.stop(9);
    bus.scheduleBar(1, 20, 2);

    expect(target.cancelAndHoldAtTime).toHaveBeenCalledWith(9);
    expect(target.setValueAtTime).toHaveBeenLastCalledWith(1, 20);
  });

  it("stops every binding repeatedly without disconnecting nodes", () => {
    const { bus, gains } = createBus([
      {
        type: "filter",
        filterType: "lp",
        frequency: staticParam(800),
        q: staticParam(1),
        detune: staticParam(0),
        gain: staticParam(0),
      },
    ]);
    const filter = FakeFilterNode.instances[0];
    const targets = [filter.frequency, filter.Q, filter.detune, filter.gain];

    bus.stop(4);
    bus.stop(5);

    targets.forEach((target) => {
      expect(target.cancelAndHoldAtTime.mock.calls).toEqual([[4], [5]]);
    });
    expect(gains[0].disconnect).not.toHaveBeenCalled();
    expect(filter.disconnect).not.toHaveBeenCalled();
    expect(gains[1].disconnect).not.toHaveBeenCalled();
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
