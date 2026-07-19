import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type AudioClock from "@web-audio/clock";
import type {
  EnvelopeSchema,
  StaticSchema,
  SynthesizerSchema,
} from "@web-audio/schema";
import Synthesizer from "./synthesizer";
import type MidiOutputScheduler from "@/midi-output-scheduler";

// ---------------------------------------------------------------------------
// Minimal Web Audio fakes
// ---------------------------------------------------------------------------

class FakeAudioParam {
  value = 0;
  setValueAtTime() {}
  linearRampToValueAtTime() {}
}

class FakeGainNode {
  gain = new FakeAudioParam();
  connect() {}
  disconnect() {}
}

class FakeOscillatorNode {
  detune = new FakeAudioParam();
  onended: (() => void) | null = null;

  constructor(ctx: AudioContext, options: OscillatorOptions) {
    void ctx;
    void options;
  }

  connect() {}
  disconnect() {}
  start() {}
  stop() {}
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
    return this._resolveDetune(this._schema.detune, barIndex, stepIndex);
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

function makeSchema(
  detune: SynthesizerSchema["detune"],
  overrides: Partial<SynthesizerSchema> = {},
): SynthesizerSchema {
  return {
    type: "synthesizer",
    waveform: "sine",
    notes: staticParam(60),
    detune,
    gain: makeEnvelope(),
    effects: [],
    muted: false,
    ...overrides,
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
  vi.stubGlobal("GainNode", FakeGainNode);
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
