import type AudioClock from "@web-audio/clock";
import type {
  BasicSynthesizerSchema,
  EnvelopeSchema,
  UnisonSynthesizerSchema,
  SynthesizerSchema,
  TimingPattern,
} from "@web-audio/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type MidiOutputScheduler from "@/midi/midi-output-scheduler";
import type { DuckTrigger } from "../../buses/duck-automation";
import RandomResolver from "@/patterns/random-resolver";
import { midiToFrequency } from "@/midi/midi-to-frequency";
import {
  defaultSynthSchema,
  randomNumberPattern,
  staticNumberPattern,
} from "../../__tests__/support/schema-fixtures";
import Synthesizer from "../synthesizer";

class FakeAudioParam {
  value = 0;
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
}

class FakeGainNode {
  static instances: FakeGainNode[] = [];
  gain = new FakeAudioParam();
  connect = vi.fn();
  disconnect = vi.fn();
  constructor() {
    FakeGainNode.instances.push(this);
  }
}

class FakeFilterNode {
  static instances: FakeFilterNode[] = [];
  frequency = new FakeAudioParam();
  Q = new FakeAudioParam();
  detune = new FakeAudioParam();
  gain = new FakeAudioParam();
  connect = vi.fn();
  disconnect = vi.fn();
  constructor() {
    FakeFilterNode.instances.push(this);
  }
}

class FakeAudioWorkletNode {
  static instances: FakeAudioWorkletNode[] = [];
  readonly port = { postMessage: vi.fn(), onmessage: null, close: vi.fn() };
  readonly parameters = new Map([
    ["frequency", new FakeAudioParam()],
    ["detune", new FakeAudioParam()],
    ["spread", new FakeAudioParam()],
    ["width", new FakeAudioParam()],
  ]);
  connect = vi.fn();
  disconnect = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();

  constructor(
    _ctx: BaseAudioContext,
    readonly name: string,
    readonly options: AudioWorkletNodeOptions,
  ) {
    FakeAudioWorkletNode.instances.push(this);
  }
}

class FakeOscillatorNode {
  static instances: FakeOscillatorNode[] = [];
  static constructionCount = 0;
  static failOnConstruction: number | undefined;
  detune = new FakeAudioParam();
  onended: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  connect = vi.fn();
  disconnect = vi.fn();
  constructor(
    _ctx: AudioContext,
    readonly options: OscillatorOptions,
  ) {
    FakeOscillatorNode.constructionCount += 1;
    if (
      FakeOscillatorNode.constructionCount ===
      FakeOscillatorNode.failOnConstruction
    )
      throw new Error("sub construction failed");
    FakeOscillatorNode.instances.push(this);
  }
}

class FakeAudioContext {
  currentTime = 0;
  sampleRate = 48_000;
  destination = {};
  createGain() {
    return new FakeGainNode();
  }
}

const timing = (
  cycle: TimingPattern["cycle"] = [[{ offset: 0, duration: 1 }]],
): TimingPattern => ({ cycle });

function envelope(max = staticNumberPattern([1])): EnvelopeSchema {
  return {
    type: "envelope",
    min: staticNumberPattern([0]),
    max,
    a: staticNumberPattern([0]),
    d: staticNumberPattern([0]),
    s: staticNumberPattern([1]),
    r: staticNumberPattern([0]),
    mode: "bleed",
  };
}

function schema(overrides: Partial<BasicSynthesizerSchema> = {}) {
  return defaultSynthSchema({
    gain: envelope(),
    ...overrides,
  });
}

function unisonSchema(
  overrides: Partial<UnisonSynthesizerSchema> = {},
): UnisonSynthesizerSchema {
  return {
    ...schema(),
    engine: "unison",
    waveform: "sawtooth",
    voices: staticNumberPattern([7]),
    spread: staticNumberPattern([10]),
    width: staticNumberPattern([0.4]),
    ...overrides,
  };
}

function synth(
  instrumentSchema: SynthesizerSchema,
  midiOutputScheduler?: MidiOutputScheduler,
  onDuck?: (trigger: DuckTrigger) => void,
) {
  return new Synthesizer(
    new FakeAudioContext() as unknown as AudioContext,
    { barDuration: 2 } as AudioClock,
    { schema: instrumentSchema, midiOutputScheduler, onDuck },
  );
}

class InspectableSynthesizer extends Synthesizer {
  resolver() {
    return this._valuePatternResolver;
  }
}

function inspectableSynth(instrumentSchema: SynthesizerSchema) {
  return new InspectableSynthesizer(
    new FakeAudioContext() as unknown as AudioContext,
    { barDuration: 2 } as AudioClock,
    { schema: instrumentSchema },
  );
}

beforeEach(() => {
  FakeGainNode.instances = [];
  FakeFilterNode.instances = [];
  FakeOscillatorNode.instances = [];
  FakeOscillatorNode.constructionCount = 0;
  FakeOscillatorNode.failOnConstruction = undefined;
  FakeAudioWorkletNode.instances = [];
  vi.stubGlobal("GainNode", FakeGainNode);
  vi.stubGlobal("BiquadFilterNode", FakeFilterNode);
  vi.stubGlobal("OscillatorNode", FakeOscillatorNode);
  vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
});

afterEach(() => vi.unstubAllGlobals());

describe("Synthesizer scheduling", () => {
  it("schedules independently patterned bounds across bars and hit indices", () => {
    const instance = synth(
      schema({
        gain: {
          type: "envelope",
          min: {
            type: "static",
            cycle: [
              [10, 20],
              [30, 40],
            ],
          },
          max: {
            type: "static",
            cycle: [[100], [200, 300, 400], [500, 600]],
          },
          a: staticNumberPattern([0.25]),
          d: staticNumberPattern([0.25]),
          s: staticNumberPattern([0.5]),
          r: staticNumberPattern([0.25]),
          mode: "bleed",
        },
        eventPattern: {
          timing: timing([
            [
              { offset: 0, duration: 1 },
              { offset: 0.25, duration: 1 },
              { offset: 0.5, duration: 1 },
            ],
          ]),
          notes: { type: "static", cycle: [[[60]]] },
        },
      }),
    );

    const existingGains = FakeGainNode.instances.length;
    instance.scheduleBar(2, 10);
    instance.scheduleBar(3, 20);

    const expected = [
      { min: 10, max: 500, start: 10 },
      { min: 20, max: 600, start: 10.5 },
      { min: 10, max: 500, start: 11 },
      { min: 30, max: 100, start: 20 },
      { min: 40, max: 100, start: 20.5 },
      { min: 30, max: 100, start: 21 },
    ];
    const gainNodes = FakeGainNode.instances.slice(existingGains);
    expect(gainNodes).toHaveLength(expected.length);
    for (const [index, { min, max, start }] of expected.entries()) {
      const gain = gainNodes[index].gain;
      const sustain = (min + max) / 2;
      expect(gain.setValueAtTime).toHaveBeenNthCalledWith(1, min, start);
      expect(gain.linearRampToValueAtTime).toHaveBeenNthCalledWith(
        1,
        max,
        start + 0.5,
      );
      expect(gain.linearRampToValueAtTime).toHaveBeenNthCalledWith(
        2,
        sustain,
        start + 1,
      );
      expect(gain.setValueAtTime).toHaveBeenNthCalledWith(
        2,
        sustain,
        start + 2,
      );
      expect(gain.linearRampToValueAtTime).toHaveBeenNthCalledWith(
        3,
        min,
        start + 2.5,
      );
    }
  });

  it("uses a source-local gain stage and clamps only static negative values", () => {
    const sourceGain = staticNumberPattern([-0.5, 1.5]);
    const instance = synth(
      schema({
        sourceGain,
        eventPattern: {
          timing: timing([
            [
              { offset: 0, duration: 1 },
              { offset: 0.5, duration: 1 },
            ],
          ]),
          notes: { type: "static", cycle: [[[60]]] },
        },
      }),
    );

    instance.scheduleBar(0, 10);

    const sourceGainNode = FakeGainNode.instances[3];
    const secondSourceGainNode = FakeGainNode.instances[5];
    expect(sourceGainNode?.gain.setValueAtTime).toHaveBeenCalledWith(0, 10);
    expect(secondSourceGainNode?.gain.setValueAtTime).toHaveBeenCalledWith(
      1.5,
      11,
    );
    expect(sourceGainNode?.connect).toHaveBeenCalled();
    expect(FakeOscillatorNode.instances[0]?.connect).toHaveBeenCalledWith(
      sourceGainNode,
    );
    expect(sourceGain.cycle).toEqual([[-0.5, 1.5]]);
  });

  it("creates one centered sub per chord note at the selected octave", () => {
    const instance = synth(
      schema({
        sub: {
          waveform: "square",
          octave: -2,
          gain: staticNumberPattern([0.5]),
        },
        eventPattern: {
          timing: timing(),
          notes: { type: "static", cycle: [[[60, 64]]] },
        },
        detune: staticNumberPattern([12]),
      }),
    );

    instance.scheduleBar(0, 10);

    expect(FakeOscillatorNode.instances).toHaveLength(4);
    expect(
      FakeOscillatorNode.instances.map(({ options }) => options.type),
    ).toEqual(["sine", "square", "sine", "square"]);
    expect(
      FakeOscillatorNode.instances.map(({ options }) => options.frequency),
    ).toEqual([
      midiToFrequency(60),
      midiToFrequency(60) / 4,
      midiToFrequency(64),
      midiToFrequency(64) / 4,
    ]);
    expect(
      FakeOscillatorNode.instances.map(({ options }) => options.detune),
    ).toEqual([12, 12, 12, 12]);
    expect(
      FakeOscillatorNode.instances.map(({ start }) => start.mock.calls.length),
    ).toEqual([1, 1, 1, 1]);
  });

  it("clamps static sub gain without mutating the schema and keeps layer stop timing", () => {
    const subGain = staticNumberPattern([-0.5]);
    const instance = synth(
      schema({
        sub: { waveform: "sine", octave: -1, gain: subGain },
        gain: envelope({
          type: "static",
          cycle: [[1]],
        }),
      }),
    );

    instance.scheduleBar(0, 10);

    expect(FakeGainNode.instances[3]?.gain.setValueAtTime).toHaveBeenCalledWith(
      0,
      10,
    );
    expect(subGain).toEqual(staticNumberPattern([-0.5]));
    expect(FakeOscillatorNode.instances[1]?.stop).toHaveBeenCalledWith(12.0525);
  });

  it("discovers sub gain LFOs through the existing parameter list", () => {
    synth(
      schema({
        sub: {
          waveform: "triangle",
          octave: -1,
          gain: {
            type: "lfo",
            id: "sub-gain",
            outputA: staticNumberPattern([0]),
            outputB: staticNumberPattern([1]),
            speed: [1],
            waveform: ["sine"],
            phase: 0,
            norm: false,
            invert: false,
          },
        },
      }),
    );

    expect(FakeAudioWorkletNode.instances).toHaveLength(1);
    expect(FakeAudioWorkletNode.instances[0]?.name).toBe("lfo-processor");
  });

  it("fans one resolved envelope detune trajectory to main and sub", () => {
    const detune: EnvelopeSchema = {
      type: "envelope",
      min: staticNumberPattern([10, 20]),
      max: staticNumberPattern([30, 40]),
      a: staticNumberPattern([0]),
      d: staticNumberPattern([0]),
      s: staticNumberPattern([1]),
      r: staticNumberPattern([0]),
      mode: "bleed",
    };
    const instance = synth(
      schema({
        detune,
        sub: {
          waveform: "sawtooth",
          octave: -1,
          gain: staticNumberPattern([1]),
        },
      }),
    );

    instance.scheduleBar(0, 10);

    for (const oscillator of FakeOscillatorNode.instances) {
      expect(oscillator.detune.setValueAtTime).toHaveBeenCalledWith(10, 10);
      expect(
        oscillator.detune.linearRampToValueAtTime,
      ).toHaveBeenLastCalledWith(10, 12.0025);
    }
  });

  it("keeps dynamic source gain automation capable of rising from zero", () => {
    const instance = synth(
      schema({
        sourceGain: {
          type: "envelope",
          min: staticNumberPattern([0]),
          max: staticNumberPattern([1]),
          a: staticNumberPattern([0.1]),
          d: staticNumberPattern([0]),
          s: staticNumberPattern([1]),
          r: staticNumberPattern([0]),
          mode: "bleed",
        },
      }),
    );

    instance.scheduleBar(0, 10);

    const sourceGainNode = FakeGainNode.instances[3];
    expect(sourceGainNode?.gain.setValueAtTime).toHaveBeenCalledWith(0, 10);
    expect(sourceGainNode?.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
      1,
      10.2,
    );
  });

  it("discovers source gain LFOs through the existing parameter list", () => {
    synth(
      schema({
        sourceGain: {
          type: "lfo",
          id: "source-gain",
          outputA: staticNumberPattern([0]),
          outputB: staticNumberPattern([1]),
          speed: [1],
          waveform: ["sine"],
          phase: 0,
          norm: false,
          invert: false,
        },
      }),
    );

    expect(FakeAudioWorkletNode.instances).toHaveLength(1);
    expect(FakeAudioWorkletNode.instances[0]?.name).toBe("lfo-processor");
  });

  it("keeps finite inverted bounds un-clamped in the scheduled main voice", () => {
    const instance = synth(
      schema({
        gain: {
          type: "envelope",
          min: staticNumberPattern([2]),
          max: staticNumberPattern([-1]),
          a: staticNumberPattern([0]),
          d: staticNumberPattern([0]),
          s: staticNumberPattern([0.25]),
          r: staticNumberPattern([0]),
          mode: "bleed",
        },
      }),
    );

    instance.scheduleBar(0, 10);

    const gain = FakeGainNode.instances.at(-1)?.gain;
    expect(gain?.setValueAtTime).toHaveBeenNthCalledWith(1, 2, 10);
    expect(gain?.linearRampToValueAtTime).toHaveBeenNthCalledWith(
      1,
      -1,
      10.0025,
    );
    expect(gain?.linearRampToValueAtTime).toHaveBeenNthCalledWith(
      2,
      1.25,
      expect.closeTo(10.005),
    );
    expect(gain?.setValueAtTime).toHaveBeenNthCalledWith(2, 1.25, 12);
    expect(gain?.linearRampToValueAtTime).toHaveBeenNthCalledWith(
      3,
      2,
      12.0025,
    );
  });

  it("schedules patterned bounds without sorting across multiple bars and hits", () => {
    const instance = synth(
      schema({
        gain: {
          type: "envelope",
          min: {
            type: "static",
            cycle: [
              [10, 90],
              [80, 5],
            ],
          },
          max: {
            type: "static",
            cycle: [
              [20, 0],
              [30, 40],
            ],
          },
          a: staticNumberPattern([0.25]),
          d: staticNumberPattern([0.25]),
          s: staticNumberPattern([0.5]),
          r: staticNumberPattern([0.25]),
          mode: "bleed",
        },
        eventPattern: {
          timing: timing([
            [
              { offset: 0, duration: 0.5 },
              { offset: 0.5, duration: 0.5 },
            ],
            [
              { offset: 0, duration: 0.5 },
              { offset: 0.5, duration: 0.5 },
            ],
          ]),
          notes: { type: "static", cycle: [[[60]], [[60]]] },
        },
      }),
    );

    instance.scheduleBar(0, 10);
    instance.scheduleBar(1, 20);

    const expected = [
      { min: 10, max: 20, sustain: 15, start: 10 },
      { min: 90, max: 0, sustain: 45, start: 11 },
      { min: 80, max: 30, sustain: 55, start: 20 },
      { min: 5, max: 40, sustain: 22.5, start: 21 },
    ];
    const gainNodes = FakeGainNode.instances.slice(2);
    expect(gainNodes).toHaveLength(expected.length);
    for (const [index, { min, max, sustain, start }] of expected.entries()) {
      const gain = gainNodes[index].gain;
      expect(gain.setValueAtTime).toHaveBeenNthCalledWith(1, min, start);
      expect(gain.linearRampToValueAtTime).toHaveBeenNthCalledWith(
        1,
        max,
        start + 0.25,
      );
      expect(gain.linearRampToValueAtTime).toHaveBeenNthCalledWith(
        2,
        sustain,
        start + 0.5,
      );
      expect(gain.setValueAtTime).toHaveBeenNthCalledWith(
        2,
        sustain,
        start + 1,
      );
      expect(gain.linearRampToValueAtTime).toHaveBeenNthCalledWith(
        3,
        min,
        start + 1.25,
      );
    }
  });

  it("resolves a random detune minimum once per event and reuses it for scheduling", () => {
    const minimum = randomNumberPattern({
      valuesPerBar: [1],
      range: { min: -20, max: 40 },
    });
    const detune: EnvelopeSchema = {
      type: "envelope",
      min: minimum,
      max: staticNumberPattern([80]),
      a: staticNumberPattern([0.25]),
      d: staticNumberPattern([0.25]),
      s: staticNumberPattern([0.5]),
      r: staticNumberPattern([0.25]),
      mode: "bleed",
    };
    const instance = inspectableSynth(
      schema({
        detune,
        sub: {
          waveform: "sine",
          octave: -1,
          gain: staticNumberPattern([0.5]),
        },
        eventPattern: {
          timing: timing([
            [
              { offset: 0, duration: 1 },
              { offset: 0.25, duration: 1 },
              { offset: 0.5, duration: 1 },
            ],
          ]),
          notes: { type: "static", cycle: [[[60]]] },
        },
      }),
    );
    const resolve = vi.spyOn(instance.resolver(), "resolve");

    instance.scheduleBar(2, 10);

    const minimumCalls = resolve.mock.calls.filter(
      ([pattern]) => pattern === minimum,
    );
    expect(minimumCalls.map(([, bar, hit]) => [bar, hit])).toEqual([
      [2, 0],
      [2, 1],
      [2, 2],
    ]);
    expect(minimumCalls).toHaveLength(3);

    const oscillators = FakeOscillatorNode.instances;
    expect(oscillators).toHaveLength(6);
    const expectedMinimum = new RandomResolver(minimum);
    for (let eventIndex = 0; eventIndex < 3; eventIndex += 1) {
      const pair = oscillators.slice(eventIndex * 2, eventIndex * 2 + 2);
      const expected = expectedMinimum.resolve(2, eventIndex);
      expect(pair.map((oscillator) => oscillator.options.detune)).toEqual([
        expected,
        expected,
      ]);
      for (const oscillator of pair) {
        expect(oscillator.detune.setValueAtTime).toHaveBeenCalledWith(
          expected,
          10 + eventIndex * 0.5,
        );
        expect(
          oscillator.detune.linearRampToValueAtTime,
        ).toHaveBeenLastCalledWith(expected, expect.any(Number));
      }
    }
  });

  it("resolves patterned detune bounds per event for both sources", () => {
    const detune: EnvelopeSchema = {
      type: "envelope",
      min: staticNumberPattern([10, 20]),
      max: staticNumberPattern([30, 40]),
      a: staticNumberPattern([0]),
      d: staticNumberPattern([0]),
      s: staticNumberPattern([1]),
      r: staticNumberPattern([0]),
      mode: "bleed",
    };
    const instance = synth(
      schema({
        detune,
        sub: {
          waveform: "square",
          octave: -2,
          gain: staticNumberPattern([0.5]),
        },
        eventPattern: {
          timing: timing([
            [
              { offset: 0, duration: 1 },
              { offset: 0.5, duration: 1 },
            ],
          ]),
          notes: { type: "static", cycle: [[[60]]] },
        },
      }),
    );

    instance.scheduleBar(0, 10);

    expect(FakeOscillatorNode.instances).toHaveLength(4);
    for (const [eventIndex, start] of [10, 11].entries()) {
      const pair = FakeOscillatorNode.instances.slice(
        eventIndex * 2,
        eventIndex * 2 + 2,
      );
      const min = [10, 20][eventIndex];
      const max = [30, 40][eventIndex];
      for (const oscillator of pair) {
        expect(oscillator.detune.setValueAtTime).toHaveBeenCalledWith(
          min,
          start,
        );
        expect(oscillator.detune.linearRampToValueAtTime).toHaveBeenCalledWith(
          max,
          start + 0.0025,
        );
      }
    }
  });

  it("resolves a random gain minimum once per event and reuses it for scheduling", () => {
    const minimum = randomNumberPattern({
      valuesPerBar: [2],
      range: { min: 0.1, max: 0.3 },
    });
    const gain: EnvelopeSchema = {
      ...envelope(staticNumberPattern([0.8])),
      min: minimum,
    };
    const instance = inspectableSynth(
      schema({
        gain,
        eventPattern: {
          timing: timing([
            [
              { offset: 0, duration: 0.5 },
              { offset: 0.5, duration: 0.5 },
            ],
          ]),
          notes: { type: "static", cycle: [[[60]]] },
        },
      }),
    );
    const resolve = vi.spyOn(instance.resolver(), "resolve");

    instance.scheduleBar(2, 10);

    const minimumCalls = resolve.mock.calls.filter(
      ([pattern]) => pattern === minimum,
    );
    expect(minimumCalls.map(([, bar, hit]) => [bar, hit])).toEqual([
      [2, 0],
      [2, 1],
    ]);
    expect(minimumCalls).toHaveLength(2);

    const expected = new RandomResolver(minimum);
    const gainNodes = FakeGainNode.instances.slice(2);
    expect(gainNodes).toHaveLength(2);
    for (const [index, node] of gainNodes.entries()) {
      const min = expected.resolve(2, index);
      expect(node.gain.setValueAtTime).toHaveBeenCalledWith(
        min,
        index === 0 ? 10 : 11,
      );
      expect(node.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(
        min,
        index === 0 ? 11.0025 : 12.0025,
      );
    }
  });

  it("uses the stable default noise seed for every voice", () => {
    const instance = synth(
      schema({
        noise: {
          color: "white",
          gain: staticNumberPattern([0.25]),
        },
        eventPattern: {
          timing: timing(),
          notes: { type: "static", cycle: [[[60, 62]]] },
        },
      }),
    );

    instance.scheduleBar(0, 10);

    expect(
      FakeAudioWorkletNode.instances
        .filter((node) => node.name === "noise-processor")
        .map((node) => node.options.processorOptions?.seed),
    ).toEqual([0, 0]);
  });

  it("bounds finite control values before native parameter calls", () => {
    const maxFloat32 = 3.4028234663852886e38;
    const unison = synth(
      unisonSchema({
        detune: staticNumberPattern([1e100]),
        spread: staticNumberPattern([1e100]),
        width: staticNumberPattern([-1e100]),
      }),
    );

    unison.scheduleBar(0, 10);

    const node = FakeAudioWorkletNode.instances[0];
    expect(node.parameters.get("detune")?.setValueAtTime).toHaveBeenCalledWith(
      maxFloat32,
      10,
    );
    expect(node.parameters.get("spread")?.setValueAtTime).toHaveBeenCalledWith(
      maxFloat32,
      10,
    );
    expect(node.parameters.get("width")?.setValueAtTime).toHaveBeenCalledWith(
      -maxFloat32,
      10,
    );

    const basic = synth(schema({ detune: staticNumberPattern([1e100]) }));
    basic.scheduleBar(0, 10);
    expect(FakeOscillatorNode.instances.at(-1)?.options.detune).toBe(
      maxFloat32,
    );
  });

  it("constructs unison sources with resolved voice frames and controls", () => {
    const instance = synth(
      unisonSchema({
        gain: {
          ...envelope(),
          r: staticNumberPattern([0.25]),
        },
        spread: staticNumberPattern([20]),
        width: staticNumberPattern([0.75]),
        eventPattern: {
          timing: timing([[{ offset: 0.25, duration: 0.5 }]]),
          notes: { type: "static", cycle: [[[60]]] },
        },
      }),
    );

    instance.scheduleBar(0, 10);

    const node = FakeAudioWorkletNode.instances[0];
    expect(node.name).toBe("supersaw-processor");
    expect(node.options.processorOptions).toMatchObject({
      voices: 7,
      startFrame: 504_000,
      stopFrame: 566_400,
    });
    expect(node.parameters.get("spread")?.setValueAtTime).toHaveBeenCalledWith(
      20,
      10.5,
    );
    expect(node.parameters.get("width")?.setValueAtTime).toHaveBeenCalledWith(
      0.75,
      10.5,
    );
  });

  it("releases an allocated unison source when sub construction fails", () => {
    FakeOscillatorNode.failOnConstruction = 1;
    const instance = synth(
      unisonSchema({
        sub: {
          waveform: "sine",
          octave: -1,
          gain: staticNumberPattern([0.5]),
        },
      }),
    );

    expect(() => instance.scheduleBar(0, 10)).toThrow(
      "sub construction failed",
    );

    const source = FakeAudioWorkletNode.instances[0];
    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(source.port.close).toHaveBeenCalledOnce();
  });

  it("emits one duck trigger per resolved onset before polyphonic voices", () => {
    const onDuck = vi.fn();
    const instance = synth(
      schema({
        muted: true,
        sourceGain: staticNumberPattern([0]),
        sub: {
          waveform: "sine",
          octave: -1,
          gain: staticNumberPattern([0.5]),
        },
        ducks: {
          music: { depth: 0.25, onset: 0.2, recovery: 0.5 },
        },
        eventPattern: {
          timing: timing([
            [
              { offset: 0.25, duration: 0.5 },
              { offset: 0.75, duration: 0.25 },
            ],
          ]),
          notes: { type: "static", cycle: [[[60, 64], [67]]] },
        },
      }),
      undefined,
      onDuck,
    );

    instance.scheduleBar(3, 10);

    expect(onDuck.mock.calls.map(([trigger]) => trigger)).toEqual([
      {
        target: "music",
        depth: 0.25,
        onset: 0.2,
        recovery: 0.5,
        duration: 1,
        startTime: 10.5,
      },
      {
        target: "music",
        depth: 0.25,
        onset: 0.2,
        recovery: 0.5,
        duration: 0.5,
        startTime: 11.5,
      },
    ]);
    expect(FakeOscillatorNode.instances).toHaveLength(6);
  });

  it("does not emit duck triggers for an empty timing bar", () => {
    const onDuck = vi.fn();
    const instance = synth(
      schema({
        ducks: { music: { depth: 1, onset: 0, recovery: 1 } },
        eventPattern: {
          timing: timing([[]]),
          notes: { type: "static", cycle: [[null]] },
        },
      }),
      undefined,
      onDuck,
    );

    instance.scheduleBar(0, 10);

    expect(onDuck).not.toHaveBeenCalled();
  });

  it("schedules static notes using explicit timing", () => {
    const instance = synth(
      schema({
        eventPattern: {
          timing: timing([
            [
              { offset: 0, duration: 0.25 },
              { offset: 0.5, duration: 0.25 },
            ],
          ]),
          notes: { type: "static", cycle: [[[60], [64]]] },
        },
        detune: staticNumberPattern([10, 20]),
      }),
    );

    instance.scheduleBar(0, 10);

    expect(
      FakeOscillatorNode.instances.map(({ options }) => options.frequency),
    ).toEqual([midiToFrequency(60), midiToFrequency(64)]);
    expect(
      FakeOscillatorNode.instances.map(({ options }) => options.detune),
    ).toEqual([10, 20]);
    expect(
      FakeOscillatorNode.instances.map(({ start }) => start.mock.calls[0][0]),
    ).toEqual([10, 11]);
  });

  it("gives every chord voice the same hit-addressed processing values", () => {
    const instance = synth(
      schema({
        eventPattern: {
          timing: timing([
            [
              { offset: 0, duration: 0.5 },
              { offset: 0.5, duration: 0.5 },
            ],
          ]),
          notes: { type: "static", cycle: [[[60, 64], [67]]] },
        },
        detune: staticNumberPattern([10, 20]),
        gain: envelope(staticNumberPattern([0.2, 0.4])),
        effects: [
          {
            type: "filter",
            filterType: "lp",
            frequency: staticNumberPattern([100, 200]),
            q: staticNumberPattern([1]),
            detune: staticNumberPattern([0]),
            gain: staticNumberPattern([0]),
          },
        ],
      }),
    );

    instance.scheduleBar(0, 10);

    expect(
      FakeOscillatorNode.instances.map(({ options }) => options.detune),
    ).toEqual([10, 10, 20]);
    expect(
      FakeFilterNode.instances.map(
        ({ frequency }) => frequency.setValueAtTime.mock.calls[0][0],
      ),
    ).toEqual([100, 100, 200]);
  });

  it("uses final surviving hit indices after chance misses", () => {
    const candidateTiming = timing([
      Array.from({ length: 8 }, (_, index) => ({
        offset: index / 8,
        duration: 0.125,
      })),
    ]);
    candidateTiming.condition = {
      type: "chance",
      probability: 0.5,
      segments: [{ seed: 42 }],
      algorithm: "xor",
      order: "forward",
    };
    const onDuck = vi.fn();
    const instance = synth(
      schema({
        ducks: { music: { depth: 1, onset: 0, recovery: 1 } },
        eventPattern: {
          timing: candidateTiming,
          notes: { type: "static", cycle: [[[60], [64]]] },
        },
        detune: staticNumberPattern([10, 20]),
      }),
      undefined,
      onDuck,
    );

    instance.scheduleBar(0, 10);

    expect(FakeOscillatorNode.instances).toHaveLength(6);
    expect(onDuck).toHaveBeenCalledTimes(6);
    expect(
      FakeOscillatorNode.instances.map(({ options }) => options.detune),
    ).toEqual([10, 20, 10, 20, 10, 20]);
  });

  it("schedules random notes by final hit", () => {
    const notes = randomNumberPattern({
      valuesPerBar: [2],
      dataType: "integer",
      valueMap: [60, 64, 67],
      segments: [{ seed: 42 }],
    });
    const resolver = new RandomResolver(notes);
    const instance = synth(
      schema({
        eventPattern: {
          timing: timing([
            [
              { offset: 0, duration: 0.5 },
              { offset: 0.5, duration: 0.5 },
            ],
          ]),
          notes,
        },
      }),
    );

    instance.scheduleBar(0, 10);

    expect(
      FakeOscillatorNode.instances.map(({ options }) => options.frequency),
    ).toEqual([
      midiToFrequency(resolver.resolve(0, 0)),
      midiToFrequency(resolver.resolve(0, 1)),
    ]);
  });

  it("does not resolve processing or schedule voices for an empty timing bar", () => {
    const instance = synth(
      schema({
        eventPattern: {
          timing: timing([[]]),
          notes: { type: "static", cycle: [[null]] },
        },
      }),
    );
    const gainCount = FakeGainNode.instances.length;

    instance.scheduleBar(0, 10);

    expect(FakeOscillatorNode.instances).toHaveLength(0);
    expect(FakeGainNode.instances).toHaveLength(gainCount);
  });

  it("keeps local playback when configured MIDI output is unavailable", () => {
    const instance = synth(
      schema({ notesOut: { type: "midi-out", channel: 1 } }),
    );

    instance.scheduleBar(0, 10);

    expect(FakeOscillatorNode.instances).toHaveLength(1);
  });

  it("clamps MIDI velocity and suppresses zero-velocity output", () => {
    const scheduleNote = vi.fn();
    const loud = synth(
      schema({
        gain: envelope(staticNumberPattern([2])),
        notesOut: { type: "midi-out", channel: 1 },
      }),
      { scheduleNote } as unknown as MidiOutputScheduler,
    );
    const silent = synth(
      schema({
        gain: envelope(staticNumberPattern([0])),
        notesOut: { type: "midi-out", channel: 1 },
      }),
      { scheduleNote } as unknown as MidiOutputScheduler,
    );

    loud.scheduleBar(0, 10);
    silent.scheduleBar(0, 10);

    expect(FakeOscillatorNode.instances).toHaveLength(2);
    expect(scheduleNote).toHaveBeenCalledTimes(1);
    expect(scheduleNote.mock.calls[0][0].velocity).toBe(127);
  });

  it("does not submit MIDI when notesOut is absent", () => {
    const scheduleNote = vi.fn();
    const instance = synth(schema(), {
      scheduleNote,
    } as unknown as MidiOutputScheduler);

    instance.scheduleBar(0, 10);

    expect(FakeOscillatorNode.instances).toHaveLength(1);
    expect(scheduleNote).not.toHaveBeenCalled();
  });

  it("mirrors every audio chord voice to MIDI with gain-derived velocity", () => {
    const scheduleNote = vi.fn();
    const instance = synth(
      schema({
        eventPattern: {
          timing: timing([[{ offset: 0.25, duration: 0.5 }]]),
          notes: { type: "static", cycle: [[[60, 64]]] },
        },
        gain: envelope(staticNumberPattern([0.5])),
        sub: {
          waveform: "triangle",
          octave: -2,
          gain: staticNumberPattern([0.25]),
        },
        notesOut: { type: "midi-out", device: "hardware", channel: 10 },
      }),
      { scheduleNote } as unknown as MidiOutputScheduler,
    );

    instance.scheduleBar(3, 10);

    expect(FakeOscillatorNode.instances).toHaveLength(4);
    expect(scheduleNote.mock.calls.map(([note]) => note)).toEqual([
      {
        selector: "hardware",
        channel: 10,
        note: 60,
        velocity: 64,
        startTime: 10.5,
        endTime: 11.5,
      },
      {
        selector: "hardware",
        channel: 10,
        note: 64,
        velocity: 64,
        startTime: 10.5,
        endTime: 11.5,
      },
    ]);
  });
});
