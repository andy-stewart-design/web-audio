import { describe, expect, it, vi } from "vitest";
import type { Midi } from "@web-audio/midi";
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
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeAudioContext {
  currentTime = 0;
  destination = {};
  gains: FakeGainNode[] = [];
  createGain() {
    const gain = new FakeGainNode();
    this.gains.push(gain);
    return gain;
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

  registerMidiBinding(bind: (midi: Midi | null) => void) {
    return this._registerMidiBinding(bind);
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
      {
        barIndex,
        stepIndex,
        startTime: endTime - noteDuration,
        duration: noteDuration,
        endTime,
      },
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

describe("Instrument.finished", () => {
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
    instrument.retire();

    // Fire first node — finished should not resolve yet
    node1.fireEnded();
    let resolved = false;
    instrument.finished.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);

    // Fire second node — finished should now resolve
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
    instrument.retire();
    instrument.cancelFutureNotes();

    let resolved = false;
    instrument.finished.then(() => {
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

    // No notes scheduled — retirement finishes immediately.
    instrument.retire();

    // Attach .then() after the promise has already settled
    let resolved = false;
    instrument.finished.then(() => {
      resolved = true;
    });

    expect(resolved).toBe(false); // microtask hasn't run yet
    await Promise.resolve();
    expect(resolved).toBe(true);
  });

  it("does not finish while an active instrument is temporarily idle", async () => {
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as AudioContext,
      {} as never,
    );
    instrument.cancelFutureNotes();
    let resolved = false;
    instrument.finished.then(() => {
      resolved = true;
    });

    await Promise.resolve();

    expect(resolved).toBe(false);
  });

  it("fires multiple .then() registrations when finished resolves", async () => {
    const ctx = new FakeAudioContext();
    const instrument = new TestInstrument(
      ctx as unknown as AudioContext,
      {} as never,
    );

    const node = new FakeSourceNode();
    instrument.track(node, [], 0);
    instrument.retire();

    const calls: number[] = [];
    instrument.finished.then(() => calls.push(1));
    instrument.finished.then(() => calls.push(2));
    instrument.finished.then(() => calls.push(3));

    node.fireEnded();
    await Promise.resolve();
    expect(calls).toEqual([1, 2, 3]);
  });
});

describe("Instrument output lifecycle", () => {
  it("always creates balancing and mute stages in order", () => {
    const ctx = new FakeAudioContext();
    const destination = {} as AudioNode;
    new TestInstrument(ctx as unknown as AudioContext, {} as never, {
      destination,
      baseGain: 0.25,
      muted: true,
    });

    const [balancing, mute] = ctx.gains;
    expect(balancing.gain.value).toBe(0.25);
    expect(mute.gain.value).toBe(0);
    expect(balancing.connect).toHaveBeenCalledWith(mute);
    expect(mute.connect).toHaveBeenCalledWith(destination);
  });

  it("uses unity mute gain for unmuted instruments", () => {
    const ctx = new FakeAudioContext();
    new TestInstrument(ctx as unknown as AudioContext, {} as never);

    expect(ctx.gains[1].gain.value).toBe(1);
  });

  it("retire removes MIDI bindings while preserving the audio graph", () => {
    const ctx = new FakeAudioContext();
    const instrument = new TestInstrument(
      ctx as unknown as AudioContext,
      {} as never,
    );
    const bind = vi.fn();
    instrument.registerMidiBinding(bind);
    instrument.connectMidi({} as Midi);

    instrument.retire();
    instrument.connectMidi({} as Midi);

    expect(bind.mock.calls.at(-1)).toEqual([null]);
    expect(ctx.gains[0].disconnect).not.toHaveBeenCalled();
    expect(ctx.gains[1].disconnect).not.toHaveBeenCalled();
  });

  it("destroy disconnects balancing, mute, and scheduled voice nodes", () => {
    const ctx = new FakeAudioContext();
    const instrument = new TestInstrument(
      ctx as unknown as AudioContext,
      {} as never,
    );
    const source = new FakeSourceNode();
    const voice = new FakeGainNode();
    instrument.track(source, [voice], 0);

    instrument.destroy();
    instrument.destroy();

    expect(ctx.gains[0].disconnect).toHaveBeenCalledOnce();
    expect(ctx.gains[1].disconnect).toHaveBeenCalledOnce();
    expect(voice.disconnect).toHaveBeenCalledOnce();
  });
});

describe("Instrument MIDI bindings", () => {
  it("binds registrations immediately when MIDI connects later", () => {
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as AudioContext,
      {} as never,
    );
    const bind = vi.fn();
    const midi = {} as Midi;
    instrument.registerMidiBinding(bind);

    instrument.connectMidi(midi);

    expect(bind.mock.calls).toEqual([[null], [midi]]);
  });

  it("treats the same MIDI instance as a no-op and tears down replacement", () => {
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as AudioContext,
      {} as never,
    );
    const bind = vi.fn();
    const first = {} as Midi;
    const second = {} as Midi;
    instrument.registerMidiBinding(bind);

    instrument.connectMidi(first);
    instrument.connectMidi(first);
    instrument.connectMidi(second);
    instrument.disconnectMidi();

    expect(bind.mock.calls).toEqual([[null], [first], [second], [null]]);
  });

  it("unregisters a binding idempotently", () => {
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as AudioContext,
      {} as never,
    );
    const bind = vi.fn();
    const unregister = instrument.registerMidiBinding(bind);

    unregister();
    unregister();
    instrument.connectMidi({} as Midi);

    expect(bind.mock.calls).toEqual([[null], [null]]);
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

  it("bounded mode — normalizes a+d+r together when they exceed 1", () => {
    // a=0.5, d=0.5, r=0.5 → adrSum=1.5 → each becomes 1/3
    const result = makeInstrument().computeTimings(
      makeEnvelope(0.5, 0.5, 0.5, 0.5, "bounded"),
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
