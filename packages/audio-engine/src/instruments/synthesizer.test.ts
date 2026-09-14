import type AudioClock from "@web-audio/clock";
import type {
  EnvelopeSchema,
  SynthesizerSchema,
  TimingPattern,
} from "@web-audio/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type MidiOutputScheduler from "@/midi-output-scheduler";
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

function schema(overrides: Partial<SynthesizerSchema> = {}) {
  return defaultSynthSchema({
    gain: envelope(),
    ...overrides,
  });
}

function synth(
  instrumentSchema: SynthesizerSchema,
  midiOutputScheduler?: MidiOutputScheduler,
) {
  return new Synthesizer(
    new FakeAudioContext() as unknown as AudioContext,
    { barDuration: 2 } as AudioClock,
    { schema: instrumentSchema, midiOutputScheduler },
  );
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

describe("Synthesizer scheduling", () => {
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
    const instance = synth(
      schema({
        eventPattern: {
          timing: candidateTiming,
          notes: { type: "static", cycle: [[[60], [64]]] },
        },
        detune: staticNumberPattern([10, 20]),
      }),
    );

    instance.scheduleBar(0, 10);

    expect(FakeOscillatorNode.instances).toHaveLength(6);
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
