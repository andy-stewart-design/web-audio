import { describe, expect, it } from "vitest";
import type {
  EnvelopeSchema,
  StaticSchema,
  SynthesizerSchema,
} from "@web-audio/schema";
import Synthesizer from "./synthesizer";

// ---------------------------------------------------------------------------
// Minimal Web Audio fakes
// ---------------------------------------------------------------------------

class FakeGainNode {
  gain = { value: 1 };
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
    return this._resolveDetune(barIndex, stepIndex);
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

function makeSchema(detune: SynthesizerSchema["detune"]): SynthesizerSchema {
  return {
    waveform: "sine",
    notes: staticParam(60),
    detune,
    gain: makeEnvelope(),
    effects: [],
  };
}

function makeSynth(detune: SynthesizerSchema["detune"]) {
  const ctx = new FakeAudioContext();
  return new TestSynthesizer(
    ctx as unknown as AudioContext,
    {} as never,
    makeSchema(detune),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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
