import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type AudioClock from "@web-audio/clock";
import type {
  EnvelopeSchema,
  FilterSchema,
  ParameterSchema,
  RandomSchema,
  StaticSchema,
  SynthesizerSchema,
} from "@web-audio/schema";
import Synthesizer from "./synthesizer";
import type MidiOutputScheduler from "@/midi-output-scheduler";
import RandomResolver from "@/resolvers/random-resolver";
import { midiToFrequency } from "@/utils/midi-to-frequency";

// ---------------------------------------------------------------------------
// Minimal Web Audio fakes
// ---------------------------------------------------------------------------

class FakeAudioParam {
  value = 0;
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
}

class FakeGainNode {
  static instances: FakeGainNode[] = [];
  gain = new FakeAudioParam();
  connect() {}
  disconnect() {}

  constructor() {
    FakeGainNode.instances.push(this);
  }
}

class FakeBiquadFilterNode {
  static instances: FakeBiquadFilterNode[] = [];
  frequency = new FakeAudioParam();
  Q = new FakeAudioParam();
  detune = new FakeAudioParam();
  gain = new FakeAudioParam();

  constructor() {
    FakeBiquadFilterNode.instances.push(this);
  }

  connect() {}
  disconnect() {}
}

class FakeOscillatorNode {
  static startCount = 0;
  static instances: FakeOscillatorNode[] = [];
  detune = new FakeAudioParam();
  onended: (() => void) | null = null;
  start = vi.fn((when: number) => {
    void when;
    FakeOscillatorNode.startCount++;
  });
  stop = vi.fn((when: number) => {
    void when;
  });

  constructor(
    ctx: AudioContext,
    readonly options: OscillatorOptions,
  ) {
    void ctx;
    FakeOscillatorNode.instances.push(this);
  }

  connect() {}
  disconnect() {}
}

class FakeAudioContext {
  currentTime = 0;
  destination = {};
  createGain() {
    return new FakeGainNode();
  }
}

// ---------------------------------------------------------------------------
// Concrete subclass that exposes _resolveDetune for testing
// ---------------------------------------------------------------------------

class TestSynthesizer extends Synthesizer {
  resolveDetune(barIndex: number, stepIndex: number) {
    return this._resolveDetune(this._schema.detune, {
      barIndex,
      hitIndex: stepIndex,
      gridStepIndex: stepIndex,
      startTime: 0,
      duration: 0,
      endTime: 0,
    });
  }
}

// ---------------------------------------------------------------------------
// Schema fixtures
// ---------------------------------------------------------------------------

function staticParam(value: number): StaticSchema {
  return {
    type: "static",
    polyphonic: false,
    cycle: [[{ value, offset: 0, duration: 1, stepIndex: 0 }]],
  };
}

function staticCycle(values: number[]): StaticSchema {
  return {
    type: "static",
    polyphonic: false,
    cycle: [
      values.map((value, stepIndex) => ({
        value,
        offset: stepIndex / values.length,
        duration: 1 / values.length,
        stepIndex,
      })),
    ],
  };
}

function sparseMask(): StaticSchema {
  return {
    type: "static",
    polyphonic: false,
    cycle: [
      [
        { value: 1, offset: 0, duration: 0.25, stepIndex: 0 },
        { value: 1, offset: 0.5, duration: 0.25, stepIndex: 2 },
      ],
    ],
  };
}

function randomMask(): RandomSchema {
  return {
    type: "random",
    dataType: "binary",
    chance: 1,
    segments: [{ seed: 42 }],
    quantValue: undefined,
    range: undefined,
    algorithm: "xor",
    grid: sparseMask(),
  };
}

function randomValues(valueMap: number[]): RandomSchema {
  return {
    type: "random",
    dataType: "float",
    segments: [{ seed: 42 }],
    quantValue: undefined,
    range: undefined,
    algorithm: "xor",
    valueMap,
    grid: staticCycle(valueMap.map(() => 1)),
  };
}

function lowpassEffect(frequency: StaticSchema): FilterSchema {
  return {
    type: "filter",
    filterType: "lp",
    frequency,
    q: staticParam(1),
    detune: staticParam(0),
    gain: staticParam(0),
  };
}

function makeEnvelope(min = 0): EnvelopeSchema {
  return {
    type: "envelope",
    min,
    max: staticParam(1),
    a: staticParam(0.25),
    d: staticParam(0.25),
    s: staticParam(0.5),
    r: staticParam(0.25),
    mode: "bleed",
  };
}

type SchemaOverrides = Omit<Partial<SynthesizerSchema>, "notes"> & {
  notes?: ParameterSchema;
  mask?: ParameterSchema;
};

function makeSchema(
  detune: SynthesizerSchema["detune"],
  overrides: SchemaOverrides = {},
): SynthesizerSchema {
  const { notes, mask, route = "main", sends = {}, ...rest } = overrides;

  return {
    type: "synthesizer",
    waveform: "sine",
    notes: {
      source: notes ?? staticParam(60),
      mask: mask,
    },
    detune,
    gain: makeEnvelope(),
    effects: [],
    muted: false,
    route,
    sends,
    ...rest,
  };
}

function makeSynth(detune: SynthesizerSchema["detune"]) {
  const ctx = new FakeAudioContext();
  return new TestSynthesizer(ctx as unknown as AudioContext, {} as never, {
    schema: makeSchema(detune),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  FakeGainNode.instances = [];
  FakeBiquadFilterNode.instances = [];
  FakeOscillatorNode.startCount = 0;
  FakeOscillatorNode.instances = [];
  vi.stubGlobal("GainNode", FakeGainNode);
  vi.stubGlobal("BiquadFilterNode", FakeBiquadFilterNode);
  vi.stubGlobal("OscillatorNode", FakeOscillatorNode);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Synthesizer._resolveDetune", () => {
  it("returns { type: 'static' } with the resolved value for a ParameterSchema", () => {
    const synth = makeSynth(staticParam(12));
    const result = synth.resolveDetune(0, 0);
    expect(result.type).toBe("static");
    expect(result.value).toBe(12);
  });

  it("returns { type: 'envelope' } with min as value for an EnvelopeSchema", () => {
    const synth = makeSynth(makeEnvelope(50));
    const result = synth.resolveDetune(0, 0);
    expect(result.type).toBe("envelope");
    expect(result.value).toBe(50);
  });

  it("envelope result carries the original schema", () => {
    const env = makeEnvelope(25);
    const synth = makeSynth(env);
    const result = synth.resolveDetune(0, 0);
    if (result.type !== "envelope") throw new Error("expected envelope");
    expect(result.schema).toBe(env);
  });
});

describe("Synthesizer unmasked hit-based scheduling", () => {
  it("addresses event parameters by hit while preserving sparse grid timing", () => {
    const notes: StaticSchema = {
      type: "static",
      polyphonic: false,
      cycle: [
        [
          { value: 60, offset: 0, duration: 0.25, stepIndex: 0 },
          { value: 64, offset: 0.5, duration: 0.25, stepIndex: 2 },
        ],
      ],
    };
    const gain = {
      ...makeEnvelope(),
      max: staticCycle([0.2, 0.4, 0.6]),
    } satisfies EnvelopeSchema;
    const synth = new Synthesizer(
      new FakeAudioContext() as unknown as AudioContext,
      { barDuration: 2 } as AudioClock,
      {
        schema: makeSchema(staticCycle([10, 20, 30]), {
          notes,
          gain,
          effects: [lowpassEffect(staticCycle([100, 200, 300]))],
        }),
      },
    );

    synth.scheduleBar(0, 10);

    expect(
      FakeOscillatorNode.instances.map(({ options }) => options.detune),
    ).toEqual([10, 20]);
    expect(
      FakeOscillatorNode.instances.map(({ start }) => start.mock.calls[0][0]),
    ).toEqual([10, 11]);

    const voiceGains = FakeGainNode.instances.filter(
      ({ gain: { linearRampToValueAtTime } }) =>
        linearRampToValueAtTime.mock.calls.length > 0,
    );
    expect(
      voiceGains.map(
        ({ gain: { linearRampToValueAtTime } }) =>
          linearRampToValueAtTime.mock.calls[0][0],
      ),
    ).toEqual([0.2, 0.4]);
    expect(
      FakeBiquadFilterNode.instances.map(
        ({ frequency }) => frequency.setValueAtTime.mock.calls[0][0],
      ),
    ).toEqual([100, 200]);
  });

  it("does not consume random note or parameter values for sparse structural rests", () => {
    const notes = randomValues([60, 64, 67]);
    notes.grid = sparseMask();
    const resolver = new RandomResolver(notes);
    const synth = new Synthesizer(
      new FakeAudioContext() as unknown as AudioContext,
      { barDuration: 2 } as AudioClock,
      {
        schema: makeSchema(staticCycle([10, 20, 30]), { notes }),
      },
    );

    synth.scheduleBar(0, 10);

    expect(
      FakeOscillatorNode.instances.map(({ options }) => options.frequency),
    ).toEqual([
      midiToFrequency(resolver.resolve(0, 0)),
      midiToFrequency(resolver.resolve(0, 1)),
    ]);
    expect(
      FakeOscillatorNode.instances.map(({ options }) => options.detune),
    ).toEqual([10, 20]);
    expect(
      FakeOscillatorNode.instances.map(({ start }) => start.mock.calls[0][0]),
    ).toEqual([10, 11]);
  });

  it("gives every chord voice the same hit index", () => {
    const notes: StaticSchema = {
      type: "static",
      polyphonic: true,
      cycle: [
        [
          { value: 60, offset: 0, duration: 0.5, stepIndex: 0 },
          { value: 64, offset: 0, duration: 0.5, stepIndex: 0 },
          { value: 67, offset: 0.5, duration: 0.5, stepIndex: 1 },
        ],
      ],
    };
    const gain = {
      ...makeEnvelope(),
      max: staticCycle([0.2, 0.4]),
    } satisfies EnvelopeSchema;
    const synth = new Synthesizer(
      new FakeAudioContext() as unknown as AudioContext,
      { barDuration: 2 } as AudioClock,
      {
        schema: makeSchema(staticCycle([10, 20]), {
          notes,
          gain,
          effects: [lowpassEffect(staticCycle([100, 200]))],
        }),
      },
    );

    synth.scheduleBar(0, 10);

    expect(
      FakeOscillatorNode.instances.map(({ options }) => options.frequency),
    ).toEqual([midiToFrequency(60), midiToFrequency(64), midiToFrequency(67)]);
    expect(
      FakeOscillatorNode.instances.map(({ options }) => options.detune),
    ).toEqual([10, 10, 20]);
    expect(
      FakeOscillatorNode.instances.map(({ start }) => start.mock.calls[0][0]),
    ).toEqual([10, 10, 11]);

    const voiceGains = FakeGainNode.instances.filter(
      ({ gain: { linearRampToValueAtTime } }) =>
        linearRampToValueAtTime.mock.calls.length > 0,
    );
    expect(
      voiceGains.map(
        ({ gain: { linearRampToValueAtTime } }) =>
          linearRampToValueAtTime.mock.calls[0][0],
      ),
    ).toEqual([0.2, 0.2, 0.4]);
    expect(
      FakeBiquadFilterNode.instances.map(
        ({ frequency }) => frequency.setValueAtTime.mock.calls[0][0],
      ),
    ).toEqual([100, 100, 200]);
  });

  it("selects value bars independently and restarts hit indices each bar", () => {
    const notes: StaticSchema = {
      type: "static",
      polyphonic: false,
      cycle: [
        [
          { value: 60, offset: 0, duration: 0.25, stepIndex: 0 },
          { value: 64, offset: 0.5, duration: 0.25, stepIndex: 2 },
        ],
        [
          { value: 67, offset: 0.25, duration: 0.25, stepIndex: 1 },
          { value: 69, offset: 0.75, duration: 0.25, stepIndex: 3 },
        ],
      ],
    };
    const detune: StaticSchema = {
      type: "static",
      polyphonic: false,
      cycle: [staticCycle([10, 20]).cycle[0], staticCycle([30, 40]).cycle[0]],
    };
    const synth = new Synthesizer(
      new FakeAudioContext() as unknown as AudioContext,
      { barDuration: 2 } as AudioClock,
      { schema: makeSchema(detune, { notes }) },
    );

    synth.scheduleBar(0, 0);
    synth.scheduleBar(1, 2);

    expect(
      FakeOscillatorNode.instances.map(({ options }) => options.frequency),
    ).toEqual([
      midiToFrequency(60),
      midiToFrequency(64),
      midiToFrequency(67),
      midiToFrequency(69),
    ]);
    expect(
      FakeOscillatorNode.instances.map(({ options }) => options.detune),
    ).toEqual([10, 20, 30, 40]);
    expect(
      FakeOscillatorNode.instances.map(({ start }) => start.mock.calls[0][0]),
    ).toEqual([0, 1, 2.5, 3.5]);
  });
});

describe("Synthesizer trigger masks", () => {
  it("cycles source notes across active static mask positions", () => {
    const ctx = new FakeAudioContext();
    const synth = new Synthesizer(
      ctx as unknown as AudioContext,
      { barDuration: 2 } as AudioClock,
      {
        schema: makeSchema(staticParam(0), {
          notes: {
            type: "static",
            polyphonic: false,
            cycle: [
              [
                { value: 60, offset: 0, duration: 0.5, stepIndex: 0 },
                { value: 64, offset: 0.5, duration: 0.5, stepIndex: 1 },
              ],
            ],
          },
          mask: {
            type: "static",
            polyphonic: false,
            cycle: [
              [
                { value: 1, offset: 0, duration: 0.25, stepIndex: 0 },
                { value: 1, offset: 0.5, duration: 0.25, stepIndex: 2 },
                { value: 1, offset: 0.75, duration: 0.25, stepIndex: 3 },
              ],
            ],
          },
        }),
      },
    );

    synth.scheduleBar(0, 10);

    expect(FakeOscillatorNode.startCount).toBe(3);
    expect(
      FakeOscillatorNode.instances.map(
        (oscillator) => oscillator.options.frequency,
      ),
    ).toEqual([midiToFrequency(60), midiToFrequency(64), midiToFrequency(60)]);
    expect(
      FakeOscillatorNode.instances.map(
        (oscillator) => oscillator.start.mock.calls[0][0],
      ),
    ).toEqual([10, 11, 11.5]);
    expect(
      FakeOscillatorNode.instances.map(
        (oscillator) => oscillator.stop.mock.calls[0][0],
      ),
    ).toEqual([10.675, 11.675, 12.175]);
  });

  it("resolves dynamic masks and skips their empty bars", () => {
    const ctx = new FakeAudioContext();
    const synth = new Synthesizer(
      ctx as unknown as AudioContext,
      { barDuration: 2 } as AudioClock,
      {
        schema: makeSchema(staticParam(0), {
          mask: {
            type: "random",
            dataType: "binary",
            chance: 1,
            segments: [{ seed: 42 }],
            quantValue: undefined,
            range: undefined,
            algorithm: "xor",
            grid: {
              type: "static",
              polyphonic: false,
              cycle: [
                [
                  { value: 1, offset: 0, duration: 0.5, stepIndex: 0 },
                  { value: 1, offset: 0.5, duration: 0.5, stepIndex: 1 },
                ],
                [],
              ],
            },
          },
        }),
      },
    );

    synth.scheduleBar(0, 10);
    synth.scheduleBar(1, 12);

    expect(FakeOscillatorNode.startCount).toBe(2);
  });
});

describe("Synthesizer sparse-rhythm indexing characterization", () => {
  it("cycles static source notes across active random-mask positions", () => {
    const synth = new Synthesizer(
      new FakeAudioContext() as unknown as AudioContext,
      { barDuration: 2 } as AudioClock,
      {
        schema: makeSchema(staticParam(0), {
          notes: staticCycle([60, 64]),
          mask: randomMask(),
        }),
      },
    );

    synth.scheduleBar(0, 10);

    expect(
      FakeOscillatorNode.instances.map(({ options }) => options.frequency),
    ).toEqual([midiToFrequency(60), midiToFrequency(64)]);
    expect(
      FakeOscillatorNode.instances.map(({ start }) => start.mock.calls[0][0]),
    ).toEqual([10, 11]);
  });

  it("resolves random notes by hit index under a static mask", () => {
    const notes = randomValues([60, 64, 67]);
    const resolver = new RandomResolver(notes);
    const synth = new Synthesizer(
      new FakeAudioContext() as unknown as AudioContext,
      { barDuration: 2 } as AudioClock,
      {
        schema: makeSchema(staticParam(0), { notes, mask: sparseMask() }),
      },
    );

    synth.scheduleBar(0, 10);

    expect(
      FakeOscillatorNode.instances.map(({ options }) => options.frequency),
    ).toEqual([
      midiToFrequency(resolver.resolve(0, 0)),
      midiToFrequency(resolver.resolve(0, 1)),
    ]);
    expect(
      FakeOscillatorNode.instances.map(({ start }) => start.mock.calls[0][0]),
    ).toEqual([10, 11]);
  });

  it("retains grid-addressed random notes under a random mask before Step 3.3", () => {
    const notes = randomValues([60, 64, 67]);
    const resolver = new RandomResolver(notes);
    const synth = new Synthesizer(
      new FakeAudioContext() as unknown as AudioContext,
      { barDuration: 2 } as AudioClock,
      {
        schema: makeSchema(staticParam(0), { notes, mask: randomMask() }),
      },
    );

    synth.scheduleBar(0, 10);

    expect(
      FakeOscillatorNode.instances.map(({ options }) => options.frequency),
    ).toEqual([
      midiToFrequency(resolver.resolve(0, 0)),
      midiToFrequency(resolver.resolve(0, 2)),
    ]);
    expect(
      FakeOscillatorNode.instances.map(({ start }) => start.mock.calls[0][0]),
    ).toEqual([10, 11]);
  });

  it("uses hit indices for static-masked event parameters while retaining sparse timing", () => {
    const gain: EnvelopeSchema = {
      min: 0,
      max: staticCycle([0.2, 0.4, 0.6]),
      a: staticCycle([0.1, 0.2, 0.3]),
      d: staticCycle([0.1, 0.2, 0.3]),
      s: staticCycle([0.5, 0.6, 0.7]),
      r: staticCycle([0.1, 0.2, 0.3]),
      mode: "bleed",
      type: "envelope",
    };
    const synth = new Synthesizer(
      new FakeAudioContext() as unknown as AudioContext,
      { barDuration: 2 } as AudioClock,
      {
        schema: makeSchema(staticCycle([10, 20, 30]), {
          notes: staticCycle([60, 64]),
          mask: sparseMask(),
          gain,
          effects: [lowpassEffect(staticCycle([100, 200, 300]))],
        }),
      },
    );

    synth.scheduleBar(0, 10);

    expect(
      FakeOscillatorNode.instances.map(({ options }) => options.detune),
    ).toEqual([10, 20]);
    expect(
      FakeOscillatorNode.instances.map(({ start }) => start.mock.calls[0][0]),
    ).toEqual([10, 11]);
    expect(
      FakeOscillatorNode.instances.map(({ stop }) => stop.mock.calls[0][0]),
    ).toEqual([expect.closeTo(10.6), expect.closeTo(11.65)]);

    const voiceGains = FakeGainNode.instances.filter(
      ({ gain: { linearRampToValueAtTime } }) =>
        linearRampToValueAtTime.mock.calls.length > 0,
    );
    expect(
      voiceGains.map(({ gain }) => gain.linearRampToValueAtTime.mock.calls[0]),
    ).toEqual([
      [0.2, 10.05],
      [0.4, 11.1],
    ]);
    expect(
      voiceGains.map(({ gain }) => gain.linearRampToValueAtTime.mock.calls[1]),
    ).toEqual([
      [0.1, expect.closeTo(10.1)],
      [0.24, expect.closeTo(11.2)],
    ]);
    expect(
      FakeBiquadFilterNode.instances.map(
        ({ frequency }) => frequency.setValueAtTime.mock.calls[0],
      ),
    ).toEqual([
      [100, 10],
      [200, 11],
    ]);
  });

  it("preserves polyphonic source onsets across static mask hits", () => {
    const notes: StaticSchema = {
      type: "static",
      polyphonic: true,
      cycle: [
        [
          { value: 60, offset: 0, duration: 0.5, stepIndex: 0 },
          { value: 64, offset: 0, duration: 0.5, stepIndex: 0 },
          { value: 67, offset: 0.5, duration: 0.5, stepIndex: 1 },
        ],
      ],
    };
    const gain = {
      ...makeEnvelope(),
      max: staticCycle([0.2, 0.4]),
    } satisfies EnvelopeSchema;
    const synth = new Synthesizer(
      new FakeAudioContext() as unknown as AudioContext,
      { barDuration: 2 } as AudioClock,
      {
        schema: makeSchema(staticCycle([10, 20]), {
          notes,
          mask: sparseMask(),
          gain,
          effects: [lowpassEffect(staticCycle([100, 200]))],
        }),
      },
    );

    synth.scheduleBar(0, 10);

    expect(
      FakeOscillatorNode.instances.map(({ options }) => options.frequency),
    ).toEqual([midiToFrequency(60), midiToFrequency(64), midiToFrequency(67)]);
    expect(
      FakeOscillatorNode.instances.map(({ options }) => options.detune),
    ).toEqual([10, 10, 20]);
    expect(
      FakeOscillatorNode.instances.map(({ start }) => start.mock.calls[0][0]),
    ).toEqual([10, 10, 11]);

    const voiceGains = FakeGainNode.instances.filter(
      ({ gain: { linearRampToValueAtTime } }) =>
        linearRampToValueAtTime.mock.calls.length > 0,
    );
    expect(
      voiceGains.map(
        ({ gain: { linearRampToValueAtTime } }) =>
          linearRampToValueAtTime.mock.calls[0][0],
      ),
    ).toEqual([0.2, 0.2, 0.4]);
    expect(
      FakeBiquadFilterNode.instances.map(
        ({ frequency }) => frequency.setValueAtTime.mock.calls[0][0],
      ),
    ).toEqual([100, 100, 200]);
  });

  it("selects value bars by bar index and values by hit index", () => {
    const mask: StaticSchema = {
      type: "static",
      polyphonic: false,
      cycle: [
        sparseMask().cycle[0],
        [
          { value: 1, offset: 0.25, duration: 0.25, stepIndex: 1 },
          { value: 1, offset: 0.75, duration: 0.25, stepIndex: 3 },
        ],
      ],
    };
    const detune: StaticSchema = {
      type: "static",
      polyphonic: false,
      cycle: [
        staticCycle([10, 20, 30]).cycle[0],
        staticCycle([40, 50, 60, 70]).cycle[0],
      ],
    };
    const notes: StaticSchema = {
      type: "static",
      polyphonic: false,
      cycle: [staticCycle([60, 64]).cycle[0], staticCycle([67, 69]).cycle[0]],
    };
    const synth = new Synthesizer(
      new FakeAudioContext() as unknown as AudioContext,
      { barDuration: 2 } as AudioClock,
      { schema: makeSchema(detune, { notes, mask }) },
    );

    synth.scheduleBar(0, 0);
    synth.scheduleBar(1, 2);

    expect(
      FakeOscillatorNode.instances.map(({ options }) => options.detune),
    ).toEqual([10, 20, 40, 50]);
    expect(
      FakeOscillatorNode.instances.map(({ start }) => start.mock.calls[0][0]),
    ).toEqual([0, 1, 2.5, 3.5]);
  });
});

describe("Synthesizer MIDI output submission", () => {
  it("submits resolved pattern timing, original note, and gain-derived velocity", () => {
    const ctx = new FakeAudioContext();
    const scheduleNote = vi.fn();
    const schema = makeSchema(staticParam(0), {
      gain: { ...makeEnvelope(), max: staticParam(0.5) },
      notesOut: { type: "midi-out", device: "hardware", channel: 10 },
      muted: true,
    });
    const synth = new Synthesizer(
      ctx as unknown as AudioContext,
      { barDuration: 2 } as AudioClock,
      {
        schema,
        midiOutputScheduler: {
          scheduleNote,
        } as unknown as MidiOutputScheduler,
      },
    );

    synth.scheduleBar(3, 10);

    expect(scheduleNote).toHaveBeenCalledWith({
      selector: "hardware",
      channel: 10,
      note: 60,
      velocity: 64,
      startTime: 10,
      endTime: 12,
    });
  });

  it("clamps velocity and skips zero-velocity output without skipping local audio", () => {
    const ctx = new FakeAudioContext();
    const scheduleNote = vi.fn();
    const scheduler = { scheduleNote } as unknown as MidiOutputScheduler;
    const clock = { barDuration: 2 } as AudioClock;
    const loud = new Synthesizer(ctx as unknown as AudioContext, clock, {
      schema: makeSchema(staticParam(0), {
        gain: { ...makeEnvelope(), max: staticParam(2) },
        notesOut: { type: "midi-out", channel: 1 },
      }),
      midiOutputScheduler: scheduler,
    });
    const silent = new Synthesizer(ctx as unknown as AudioContext, clock, {
      schema: makeSchema(staticParam(0), {
        gain: { ...makeEnvelope(), max: staticParam(-1) },
        notesOut: { type: "midi-out", channel: 1 },
      }),
      midiOutputScheduler: scheduler,
    });

    loud.scheduleBar(0, 0);
    silent.scheduleBar(0, 0);

    expect(scheduleNote).toHaveBeenCalledOnce();
    expect(scheduleNote).toHaveBeenCalledWith(
      expect.objectContaining({ velocity: 127 }),
    );
    expect(scheduleNote.mock.calls[0][0]).not.toHaveProperty("selector");
  });

  it("continues local playback when MIDI output is configured but unavailable", () => {
    const ctx = new FakeAudioContext();
    const synth = new Synthesizer(
      ctx as unknown as AudioContext,
      { barDuration: 2 } as AudioClock,
      {
        schema: makeSchema(staticParam(0), {
          notesOut: { type: "midi-out", channel: 1 },
        }),
      },
    );

    synth.scheduleBar(0, 0);

    expect(FakeOscillatorNode.startCount).toBe(1);
  });

  it("does not submit MIDI when notesOut is absent", () => {
    const ctx = new FakeAudioContext();
    const scheduleNote = vi.fn();
    const synth = new Synthesizer(
      ctx as unknown as AudioContext,
      { barDuration: 2 } as AudioClock,
      {
        schema: makeSchema(staticParam(0)),
        midiOutputScheduler: {
          scheduleNote,
        } as unknown as MidiOutputScheduler,
      },
    );

    synth.scheduleBar(0, 0);

    expect(scheduleNote).not.toHaveBeenCalled();
  });
});
