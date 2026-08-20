import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LfoSchema, StaticSchema } from "@web-audio/schema";
import ParameterManager from "./parameter-manager";

class FakeAudioParam {
  value = 123;
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
  setTargetAtTime = vi.fn();
}

class FakeAudioWorkletNode {
  static instances: FakeAudioWorkletNode[] = [];
  parameters = new Map([
    ["outputA", new FakeAudioParam()],
    ["outputB", new FakeAudioParam()],
  ]);
  connect = vi.fn();
  disconnect = vi.fn();

  constructor(
    readonly ctx: AudioContext,
    readonly name: string,
    readonly options: AudioWorkletNodeOptions,
  ) {
    FakeAudioWorkletNode.instances.push(this);
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

function lfo(id = "lfo-1"): LfoSchema {
  return {
    type: "lfo",
    id,
    outputA: staticParam(10),
    outputB: staticParam(20),
    speed: [1],
    waveform: ["sine"],
    phase: 0.25,
    norm: false,
    invert: false,
  };
}

function createManager(currentTime = 4) {
  const ctx = { currentTime } as AudioContext;
  const clock = { barDuration: 2 } as never;
  return { ctx, manager: new ParameterManager(ctx, clock) };
}

beforeEach(() => {
  FakeAudioWorkletNode.instances = [];
  vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
});

describe("ParameterManager LFO lifecycle", () => {
  it("initializes each registered LFO once with transport phase context", () => {
    const { manager } = createManager();
    const schema = lfo();

    manager.initializeLfos([schema, schema], 3, 10);

    expect(FakeAudioWorkletNode.instances).toHaveLength(1);
    const node = FakeAudioWorkletNode.instances[0];
    expect(node.name).toBe("lfo-processor");
    expect(node.options.parameterData).toEqual({ outputA: 10, outputB: 20 });
    expect(node.options.processorOptions).toMatchObject({
      initialPhase: 0.25,
      barDuration: 2,
      barOriginTime: 4,
    });
  });

  it("initializes and schedules cycling bounds from the starting bar", () => {
    const { manager } = createManager();
    const schema = lfo();
    schema.outputA = staticParam(10, 30);
    schema.outputB = staticParam(20, 40);

    manager.initializeLfos([schema], 1, 10);

    const node = FakeAudioWorkletNode.instances[0];
    expect(node.options.parameterData).toEqual({ outputA: 30, outputB: 40 });
    expect(node.parameters.get("outputA")?.setValueAtTime).toHaveBeenCalledWith(
      30,
      10,
    );
    expect(node.parameters.get("outputB")?.setValueAtTime).toHaveBeenCalledWith(
      40,
      10,
    );
  });

  it("updates persistent output bounds at the bar boundary", () => {
    const { manager } = createManager();
    manager.initializeLfos([lfo()]);
    const node = FakeAudioWorkletNode.instances[0];

    manager.updateLfoParams(0, 12);

    expect(node.parameters.get("outputA")?.setValueAtTime).toHaveBeenCalledWith(
      10,
      12,
    );
    expect(node.parameters.get("outputB")?.setValueAtTime).toHaveBeenCalledWith(
      20,
      12,
    );
  });

  it.each(["gain", "frequency", "Q", "detune"])(
    "uses absolute-value semantics for %s by neutralizing intrinsic value",
    () => {
      const { manager } = createManager();
      const schema = lfo();
      const param = new FakeAudioParam();
      const cleanups: (() => void)[] = [];
      manager.initializeLfos([schema]);

      manager.connectLfo(param as unknown as AudioParam, schema, cleanups);

      expect(param.value).toBe(0);
      expect(FakeAudioWorkletNode.instances[0].connect).toHaveBeenCalledWith(
        param,
      );
      expect(cleanups).toHaveLength(1);
    },
  );

  it("owns and idempotently disconnects each LFO parameter edge", () => {
    const { manager } = createManager();
    const schema = lfo();
    const param = new FakeAudioParam();
    const cleanups: (() => void)[] = [];
    manager.initializeLfos([schema]);
    manager.connectLfo(param as unknown as AudioParam, schema, cleanups);
    const node = FakeAudioWorkletNode.instances[0];

    cleanups[0]();
    cleanups[0]();

    expect(node.disconnect).toHaveBeenCalledOnce();
    expect(node.disconnect).toHaveBeenCalledWith(param);
  });

  it("disconnects persistent LFO resources on destruction", () => {
    const { manager } = createManager();
    manager.initializeLfos([lfo("a"), lfo("b")]);

    manager.destroy();
    manager.destroy();

    for (const node of FakeAudioWorkletNode.instances) {
      expect(node.disconnect).toHaveBeenCalledOnce();
      expect(node.disconnect).toHaveBeenCalledWith();
    }
  });
});

describe("ParameterManager parameter resolution", () => {
  it("applies static values at the supplied scheduling time", () => {
    const { manager } = createManager();
    const param = new FakeAudioParam();

    manager.applyParamSchema(
      param as unknown as AudioParam,
      staticParam(0.75),
      {
        barIndex: 0,
        stepIndex: 0,
        startTime: 10,
        duration: 1,
        endTime: 11,
      },
    );

    expect(param.setValueAtTime).toHaveBeenCalledWith(0.75, 10);
  });

  it("resolves envelope values against the supplied bar and step", () => {
    const { manager } = createManager();
    const context = {
      barIndex: 0,
      stepIndex: 0,
      startTime: 10,
      duration: 2,
      endTime: 12,
    };

    expect(
      manager.resolveEnvelope(
        {
          type: "envelope",
          min: 0,
          max: staticParam(1),
          a: staticParam(0.1),
          d: staticParam(0.2),
          s: staticParam(0.5),
          r: staticParam(0.3),
          mode: "bounded",
        },
        context,
      ),
    ).toEqual({
      min: 0,
      max: 1,
      a: 0.1,
      d: 0.2,
      s: 0.5,
      r: 0.3,
      mode: "bounded",
    });
  });
});
