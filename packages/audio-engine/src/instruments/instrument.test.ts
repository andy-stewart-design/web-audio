import { describe, expect, it, vi } from "vitest";
import type { CcSignal, Midi } from "@web-audio/midi";
import type { MidiCcSchema } from "@web-audio/schema";
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

class FakeAudioParam {
  value = 0;
  setValueAtTime = vi.fn();
  setTargetAtTime = vi.fn();
}

class FakeCcSignal implements CcSignal {
  value = 0;
  raw = 0;
  hasValue = false;
  deviceId: string | null = null;
  receivedChannel: number | null = null;
  private subscribers = new Set<(value: number) => void>();

  channel() {
    return this;
  }

  subscribe(fn: (value: number) => void) {
    this.subscribers.add(fn);
    fn(this.value);
    return () => this.subscribers.delete(fn);
  }

  emit(raw: number) {
    this.raw = raw;
    this.value = raw / 127;
    this.hasValue = true;
    this.subscribers.forEach((fn) => fn(this.value));
  }

  get subscriberCount() {
    return this.subscribers.size;
  }
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
    midiBindings: (() => void)[] = [],
  ) {
    this._track(
      sourceNode as unknown as AudioScheduledSourceNode,
      audioNodes as unknown as AudioNode[],
      startTime,
      midiBindings,
    );
  }

  applyParam(param: AudioParam, schema: MidiCcSchema) {
    const midiBindings: (() => void)[] = [];
    this._parameters.applyParamSchema(
      param,
      schema,
      { barIndex: 0, stepIndex: 0, startTime: 10, duration: 1, endTime: 11 },
      1,
      midiBindings,
    );
    return midiBindings;
  }

  registerMidiBinding(bind: (midi: Midi | null) => void) {
    return this._parameters.registerMidiBinding(bind);
  }
}

// ---------------------------------------------------------------------------
// Schema fixtures
// ---------------------------------------------------------------------------

function midiCc(overrides: Partial<MidiCcSchema> = {}): MidiCcSchema {
  return {
    type: "midi-cc",
    cc: 74,
    range: { min: 0, max: 10, curve: "linear" },
    default: 5,
    ...overrides,
  };
}

function midiWithSignal(signal: FakeCcSignal) {
  const cc = vi.fn(() => signal);
  return { midi: { in: { cc } } as unknown as Midi, cc };
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

describe("Instrument MIDI CC parameters", () => {
  it("initializes immediately without scheduling a future overwrite", () => {
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as AudioContext,
      {} as never,
    );
    const param = new FakeAudioParam();

    instrument.applyParam(param as unknown as AudioParam, midiCc());

    expect(param.value).toBe(5);
    expect(param.setValueAtTime).not.toHaveBeenCalled();
  });

  it("binds existing parameters when MIDI connects and smooths later updates", () => {
    const ctx = new FakeAudioContext();
    ctx.currentTime = 4;
    const instrument = new TestInstrument(
      ctx as unknown as AudioContext,
      {} as never,
    );
    const param = new FakeAudioParam();
    const signal = new FakeCcSignal();
    signal.emit(64);
    const { midi } = midiWithSignal(signal);
    instrument.applyParam(param as unknown as AudioParam, midiCc());

    instrument.connectMidi(midi);
    expect(param.value).toBeCloseTo((64 / 127) * 10);

    signal.emit(127);
    expect(param.setTargetAtTime).toHaveBeenCalledWith(10, 4, 0.01);
  });

  it("maps exponential, reversed, and constant ranges", () => {
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as AudioContext,
      {} as never,
    );

    const cases = [
      {
        schema: midiCc({
          range: { min: 20, max: 20_000, curve: "exponential" },
        }),
        expected: Math.sqrt(20 * 20_000),
      },
      {
        schema: midiCc({ range: { min: 10, max: 0, curve: "linear" } }),
        expected: 5,
      },
      {
        schema: midiCc({ range: { min: 3, max: 3, curve: "linear" } }),
        expected: 3,
      },
    ];

    for (const { schema, expected } of cases) {
      const param = new FakeAudioParam();
      const signal = new FakeCcSignal();
      signal.emit(63.5);
      instrument.applyParam(param as unknown as AudioParam, schema);
      instrument.connectMidi(midiWithSignal(signal).midi);
      expect(param.value).toBeCloseTo(expected);
      instrument.disconnectMidi();
    }
  });

  it("distinguishes a first real zero from an absent CC value", () => {
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as AudioContext,
      {} as never,
    );
    const param = new FakeAudioParam();
    const signal = new FakeCcSignal();
    instrument.applyParam(param as unknown as AudioParam, midiCc());
    instrument.connectMidi(midiWithSignal(signal).midi);
    expect(param.value).toBe(5);

    signal.emit(0);

    expect(param.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, 0.01);
  });

  it("initializes newly created parameters from an already connected controller", () => {
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as AudioContext,
      {} as never,
    );
    const signal = new FakeCcSignal();
    signal.emit(127);
    instrument.connectMidi(midiWithSignal(signal).midi);
    const param = new FakeAudioParam();

    instrument.applyParam(param as unknown as AudioParam, midiCc());

    expect(param.value).toBe(10);
  });

  it("uses device and channel scopes and cleans up on retirement", () => {
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as AudioContext,
      {} as never,
    );
    const signal = new FakeCcSignal();
    const channel = vi.spyOn(signal, "channel");
    const { midi, cc } = midiWithSignal(signal);
    instrument.applyParam(
      new FakeAudioParam() as unknown as AudioParam,
      midiCc({ device: "controller", channel: 3 }),
    );
    instrument.connectMidi(midi);

    expect(cc).toHaveBeenCalledWith("controller", 74);
    expect(channel).toHaveBeenCalledWith(3);
    expect(signal.subscriberCount).toBe(1);

    instrument.retire();

    expect(signal.subscriberCount).toBe(0);
  });

  it("moves subscriptions on MIDI replacement and removes them on destroy", () => {
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as AudioContext,
      {} as never,
    );
    const first = new FakeCcSignal();
    const second = new FakeCcSignal();
    instrument.applyParam(
      new FakeAudioParam() as unknown as AudioParam,
      midiCc(),
    );

    instrument.connectMidi(midiWithSignal(first).midi);
    expect(first.subscriberCount).toBe(1);
    instrument.connectMidi(midiWithSignal(second).midi);
    expect(first.subscriberCount).toBe(0);
    expect(second.subscriberCount).toBe(1);

    instrument.destroy();

    expect(second.subscriberCount).toBe(0);
  });

  it("removes voice bindings when transport stop cancels notes", () => {
    const ctx = new FakeAudioContext();
    const instrument = new TestInstrument(
      ctx as unknown as AudioContext,
      {} as never,
    );
    const signal = new FakeCcSignal();
    const bindings = instrument.applyParam(
      new FakeAudioParam() as unknown as AudioParam,
      midiCc(),
    );
    instrument.connectMidi(midiWithSignal(signal).midi);
    instrument.track(new FakeSourceNode(), [], 1, bindings);
    expect(signal.subscriberCount).toBe(1);

    instrument.cancelFutureNotes();

    expect(signal.subscriberCount).toBe(0);
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
