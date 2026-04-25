import { describe, expect, it } from "vitest";
import type { EnvelopeSchema, StaticSchema } from "@web-audio/schema";
import Instrument from "./instrument";

// ---------------------------------------------------------------------------
// Minimal Web Audio fakes — only what Instrument needs
// ---------------------------------------------------------------------------

class FakeSourceNode {
  onended: (() => void) | null = null;
  connect() {}
  disconnect() {}
  start() {}
  stop() {}
  fireEnded() {
    this.onended?.();
  }
}

class FakeGainNode {
  gain = {
    value: 1,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
  };
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
// Concrete subclass that exposes _track for testing
// ---------------------------------------------------------------------------

class TestInstrument extends Instrument {
  scheduleBar() {}

  track(
    sourceNode: FakeSourceNode,
    audioNodes: FakeGainNode[],
    startTime: number,
  ) {
    this._track(
      sourceNode as unknown as AudioScheduledSourceNode,
      audioNodes as unknown as AudioNode[],
      startTime,
    );
  }

  computeTimings(
    envSchema: EnvelopeSchema,
    barIndex: number,
    stepIndex: number,
    noteDuration: number,
    endTime: number,
    scale?: number,
  ) {
    return this._computeTimings(
      envSchema,
      barIndex,
      stepIndex,
      noteDuration,
      endTime,
      scale,
    );
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

function makeEnvelope(
  a: number,
  d: number,
  s: number,
  r: number,
  mode: EnvelopeSchema["mode"] = "bleed",
): EnvelopeSchema {
  return {
    type: "envelope",
    min: 0,
    max: staticParam(1),
    a: staticParam(a),
    d: staticParam(d),
    s: staticParam(s),
    r: staticParam(r),
    mode,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Instrument.done", () => {
  it("resolves after all scheduled notes fire onended", async () => {
    const ctx = new FakeAudioContext();
    const instrument = new TestInstrument(
      ctx as unknown as AudioContext,
      {} as never,
    );

    const node1 = new FakeSourceNode();
    const node2 = new FakeSourceNode();
    instrument.track(node1, [], 0);
    instrument.track(node2, [], 0);

    // Fire first node — done should not resolve yet
    node1.fireEnded();
    let resolved = false;
    instrument.done.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);

    // Fire second node — done should now resolve
    node2.fireEnded();
    await Promise.resolve();
    expect(resolved).toBe(true);
  });

  it("resolves when cancelFutureNotes drains all scheduled notes", async () => {
    const ctx = new FakeAudioContext();
    ctx.currentTime = 0;
    const instrument = new TestInstrument(
      ctx as unknown as AudioContext,
      {} as never,
    );

    const node = new FakeSourceNode();
    instrument.track(node, [], 1); // startTime=1 > currentTime=0

    instrument.cancelFutureNotes();

    let resolved = false;
    instrument.done.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(true);
  });

  it("fires .then() registered after resolution in the next microtask", async () => {
    const ctx = new FakeAudioContext();
    const instrument = new TestInstrument(
      ctx as unknown as AudioContext,
      {} as never,
    );

    // No notes scheduled — cancelFutureNotes resolves immediately
    instrument.cancelFutureNotes();

    // Attach .then() after the promise has already settled
    let resolved = false;
    instrument.done.then(() => {
      resolved = true;
    });

    expect(resolved).toBe(false); // microtask hasn't run yet
    await Promise.resolve();
    expect(resolved).toBe(true);
  });

  it("fires multiple .then() registrations when done resolves", async () => {
    const ctx = new FakeAudioContext();
    const instrument = new TestInstrument(
      ctx as unknown as AudioContext,
      {} as never,
    );

    const node = new FakeSourceNode();
    instrument.track(node, [], 0);

    const calls: number[] = [];
    instrument.done.then(() => calls.push(1));
    instrument.done.then(() => calls.push(2));
    instrument.done.then(() => calls.push(3));

    node.fireEnded();
    await Promise.resolve();
    expect(calls).toEqual([1, 2, 3]);
  });
});

describe("Instrument._computeTimings", () => {
  function makeInstrument() {
    const ctx = new FakeAudioContext();
    return new TestInstrument(ctx as unknown as AudioContext, {} as never);
  }

  it("resolves static envelope fields and computes timing durations", () => {
    const result = makeInstrument().computeTimings(
      makeEnvelope(0.25, 0.25, 0.5, 0.25),
      0,
      0,
      2,
      5,
    );
    expect(result.startTime).toBe(3);
    expect(result.attackDur).toBeCloseTo(0.5);
    expect(result.decayDur).toBeCloseTo(0.5);
    expect(result.releaseDur).toBeCloseTo(0.5);
  });

  it("bleed mode — normalizes a+d when they exceed 1, clamps r to 1", () => {
    // a=0.7, d=0.7 → adSum=1.4 → a=0.5, d=0.5; r=1.5 clamped to 1.0
    const result = makeInstrument().computeTimings(
      makeEnvelope(0.7, 0.7, 0.5, 1.5, "bleed"),
      0,
      0,
      2,
      5,
    );
    expect(result.attackDur).toBeCloseTo(0.5 * 2);
    expect(result.decayDur).toBeCloseTo(0.5 * 2);
    expect(result.releaseDur).toBeCloseTo(1.0 * 2);
  });

  it("clip mode — normalizes a+d+r together when they exceed 1", () => {
    // a=0.5, d=0.5, r=0.5 → adrSum=1.5 → each becomes 1/3
    const result = makeInstrument().computeTimings(
      makeEnvelope(0.5, 0.5, 0.5, 0.5, "clip"),
      0,
      0,
      3,
      6,
    );
    expect(result.attackDur).toBeCloseTo((1 / 3) * 3);
    expect(result.decayDur).toBeCloseTo((1 / 3) * 3);
    expect(result.releaseDur).toBeCloseTo((1 / 3) * 3);
  });

  it("applies scale to min and max", () => {
    const env: EnvelopeSchema = {
      ...makeEnvelope(0.25, 0.25, 0.5, 0.25),
      min: 0,
      max: staticParam(1),
    };
    const result = makeInstrument().computeTimings(env, 0, 0, 2, 5, 0.5);
    expect(result.max).toBeCloseTo(0.5);
  });
});
