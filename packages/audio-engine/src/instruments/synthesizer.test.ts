import type AudioClock from "@web-audio/clock";
import type {
  BasicSynthesizerSchema,
  EnvelopeSchema,
  UnisonSynthesizerSchema,
  SynthesizerSchema,
  TimingPattern,
} from "@web-audio/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type MidiOutputScheduler from "@/midi-output-scheduler";
import type { DuckTrigger } from "@/types";
import RandomResolver from "@/resolvers/random-resolver";
import { midiToFrequency } from "@/utils/midi-to-frequency";
import {
  defaultSynthSchema,
  randomNumberPattern,
  staticNumberPattern,
} from "../test-utils/schema-fixtures";
import Synthesizer from "./synthesizer";

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
    min: 0,
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

beforeEach(() => {
  FakeGainNode.instances = [];
  FakeFilterNode.instances = [];
  FakeOscillatorNode.instances = [];
  FakeAudioWorkletNode.instances = [];
  vi.stubGlobal("GainNode", FakeGainNode);
  vi.stubGlobal("BiquadFilterNode", FakeFilterNode);
  vi.stubGlobal("OscillatorNode", FakeOscillatorNode);
  vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
});

afterEach(() => vi.unstubAllGlobals());

describe("Synthesizer scheduling", () => {
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

  it("emits one duck trigger per resolved onset before polyphonic voices", () => {
    const onDuck = vi.fn();
    const instance = synth(
      schema({
        muted: true,
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
    expect(FakeOscillatorNode.instances).toHaveLength(3);
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
        notesOut: { type: "midi-out", device: "hardware", channel: 10 },
      }),
      { scheduleNote } as unknown as MidiOutputScheduler,
    );

    instance.scheduleBar(3, 10);

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
