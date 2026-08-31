import { describe, expect, it, vi } from "vitest";
import type { CcSignal, Midi } from "@web-audio/midi";
import type {
  AudioParamSchema,
  EnvelopeSchema,
  LfoSchema,
  MidiCcSchema,
  StaticSchema,
} from "@web-audio/schema";
import type { EventScheduleContext } from "@/types";
import Instrument from "./instrument";

// ---------------------------------------------------------------------------
// Minimal Web Audio fakes — only what Instrument needs
// ---------------------------------------------------------------------------

class FakeSourceNode {
  onended: (() => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
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

class FakeLfoNode {
  connectedIntrinsicValues: number[] = [];
  connect = vi.fn((param: FakeAudioParam) => {
    this.connectedIntrinsicValues.push(param.value);
  });
  disconnect = vi.fn();
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
    completionCleanups: (() => void)[] = [],
  ) {
    this._track(
      sourceNode as unknown as AudioScheduledSourceNode,
      audioNodes as unknown as AudioNode[],
      startTime,
      completionCleanups,
    );
  }

  applyParam(
    param: AudioParam,
    schema: AudioParamSchema,
    event = eventContext(),
  ) {
    const completionCleanups: (() => void)[] = [];
    this._applyParamSchema(param, schema, event, 1, completionCleanups);
    return completionCleanups;
  }

  resolveDetune(schema: AudioParamSchema, event: EventScheduleContext) {
    return this._resolveDetune(schema, event);
  }

  resolveEnvelope(schema: EnvelopeSchema, event: EventScheduleContext) {
    return this._resolveEnvelope(schema, event);
  }

  registerMidiBinding(bind: (midi: Midi | null) => void) {
    return this._registerMidiBinding(bind);
  }

  registerLfo(schema: LfoSchema, node: FakeLfoNode) {
    this._lfoNodes.set(schema.id, node as unknown as AudioWorkletNode);
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

function eventContext(overrides: Partial<EventScheduleContext> = {}) {
  return {
    barIndex: 0,
    hitIndex: 0,
    startTime: 10,
    duration: 1,
    endTime: 11,
    ...overrides,
  } satisfies EventScheduleContext;
}

function lfo(): LfoSchema {
  return {
    type: "lfo",
    id: "test-lfo",
    outputA: staticParam(400),
    outputB: staticParam(1200),
    speed: [1],
    waveform: ["sine"],
    phase: 0,
    norm: true,
    invert: false,
  };
}

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

  it("branches post-mute sends through independent owned gain nodes", () => {
    const ctx = new FakeAudioContext();
    const primary = {} as AudioNode;
    const verb = {} as AudioNode;
    const delay = {} as AudioNode;
    const instrument = new TestInstrument(
      ctx as unknown as AudioContext,
      {} as never,
      {
        routing: {
          primary,
          sends: [
            { destination: verb, amount: 0.2 },
            { destination: delay, amount: 0.4 },
          ],
        },
      },
    );
    const [balancing, mute, verbSend, delaySend] = ctx.gains;

    expect(balancing.connect).toHaveBeenCalledWith(mute);
    expect(mute.connect.mock.calls).toEqual([
      [primary],
      [verbSend],
      [delaySend],
    ]);
    expect(verbSend.gain.value).toBe(0.2);
    expect(delaySend.gain.value).toBe(0.4);
    expect(verbSend.connect).toHaveBeenCalledWith(verb);
    expect(delaySend.connect).toHaveBeenCalledWith(delay);

    instrument.destroy();
    expect(verbSend.disconnect).toHaveBeenCalledOnce();
    expect(delaySend.disconnect).toHaveBeenCalledOnce();
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

describe("Instrument event schedule context", () => {
  it("resolves static event parameters by hit index, not grid index", () => {
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as AudioContext,
      {} as never,
    );
    const param = new FakeAudioParam();
    const event = eventContext({ hitIndex: 1 });

    instrument.applyParam(
      param as unknown as AudioParam,
      staticCycle([100, 200, 300]),
      event,
    );

    expect(param.setValueAtTime).toHaveBeenCalledWith(200, 10);
  });

  it("resolves detune and every envelope component by hit index", () => {
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as AudioContext,
      {} as never,
    );
    const event = eventContext({ hitIndex: 1 });
    const envelope: EnvelopeSchema = {
      type: "envelope",
      min: 0,
      max: staticCycle([1, 2, 3]),
      a: staticCycle([0.1, 0.2, 0.3]),
      d: staticCycle([0.2, 0.3, 0.4]),
      s: staticCycle([0.3, 0.4, 0.5]),
      r: staticCycle([0.4, 0.5, 0.6]),
      mode: "bleed",
    };

    expect(
      instrument.resolveDetune(staticCycle([10, 20, 30]), event),
    ).toMatchObject({ type: "static", value: 20 });
    expect(instrument.resolveEnvelope(envelope, event)).toEqual({
      min: 0,
      max: 2,
      a: 0.2,
      d: 0.3,
      s: 0.4,
      r: 0.5,
      mode: "bleed",
    });
  });
});

describe("Instrument LFO parameter values", () => {
  it.each([
    ["gain", 1],
    ["filter frequency", 350],
    ["filter Q", 1],
    ["filter gain", 4],
    ["detune", 100],
  ])(
    "neutralizes the native %s value before connecting",
    (_target, nativeValue) => {
      const instrument = new TestInstrument(
        new FakeAudioContext() as unknown as AudioContext,
        {} as never,
      );
      const schema = lfo();
      const node = new FakeLfoNode();
      const param = new FakeAudioParam();
      param.value = nativeValue;
      instrument.registerLfo(schema, node);

      const cleanups = instrument.applyParam(
        param as unknown as AudioParam,
        schema,
      );

      expect(param.value).toBe(0);
      expect(node.connect).toHaveBeenCalledWith(param);
      expect(node.connectedIntrinsicValues).toEqual([0]);
      expect(cleanups).toHaveLength(1);
    },
  );

  it("does not alter a target when its LFO node is unavailable", () => {
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as AudioContext,
      {} as never,
    );
    const param = new FakeAudioParam();
    param.value = 350;

    instrument.applyParam(param as unknown as AudioParam, lfo());

    expect(param.value).toBe(350);
  });

  it("leaves non-LFO intrinsic values unchanged", () => {
    const instrument = new TestInstrument(
      new FakeAudioContext() as unknown as AudioContext,
      {} as never,
    );
    const param = new FakeAudioParam();
    param.value = 350;

    instrument.applyParam(param as unknown as AudioParam, staticParam(800));

    expect(param.value).toBe(350);
    expect(param.setValueAtTime).toHaveBeenCalledWith(800, 10);
  });
});

describe("Instrument LFO effective-value compatibility", () => {
  it.each([
    {
      target: "oscillator detune",
      nativeValue: 0,
      configuredRange: [-100, 100],
      oldRange: [-100, 100],
    },
    {
      target: "buffer-source detune",
      nativeValue: 0,
      configuredRange: [-100, 100],
      oldRange: [-100, 100],
    },
    {
      target: "filter frequency",
      nativeValue: 350,
      configuredRange: [400, 1200],
      oldRange: [750, 1550],
    },
    {
      target: "filter Q",
      nativeValue: 1,
      configuredRange: [0.5, 8],
      oldRange: [1.5, 9],
    },
    {
      target: "filter gain",
      nativeValue: 0,
      configuredRange: [-6, 6],
      oldRange: [-6, 6],
    },
    {
      target: "gain-effect gain",
      nativeValue: 1,
      configuredRange: [0, 1],
      oldRange: [1, 2],
    },
  ])(
    "$target changes from the inspectable old range to the configured range",
    ({ nativeValue, configuredRange, oldRange }) => {
      const instrument = new TestInstrument(
        new FakeAudioContext() as unknown as AudioContext,
        {} as never,
      );
      const schema = lfo();
      const node = new FakeLfoNode();
      const param = new FakeAudioParam();
      param.value = nativeValue;
      instrument.registerLfo(schema, node);

      expect(configuredRange.map((value) => value + nativeValue)).toEqual(
        oldRange,
      );

      instrument.applyParam(param as unknown as AudioParam, schema);
      const correctedEffectiveRange = configuredRange.map(
        (value) => value + param.value,
      );

      expect(correctedEffectiveRange).toEqual(configuredRange);
    },
  );
});

describe("Instrument LFO edge lifecycle", () => {
  function setupVoice(startTime: number) {
    const ctx = new FakeAudioContext();
    const instrument = new TestInstrument(
      ctx as unknown as AudioContext,
      {} as never,
    );
    const schema = lfo();
    const lfoNode = new FakeLfoNode();
    const param = new FakeAudioParam();
    const source = new FakeSourceNode();
    instrument.registerLfo(schema, lfoNode);
    const cleanups = instrument.applyParam(
      param as unknown as AudioParam,
      schema,
    );
    instrument.track(source, [], startTime, cleanups);
    return { ctx, instrument, lfoNode, param, source };
  }

  it("disconnects an LFO parameter edge once when its voice ends", () => {
    const { lfoNode, param, source } = setupVoice(0);

    source.fireEnded();
    source.fireEnded();

    expect(lfoNode.disconnect).toHaveBeenCalledOnce();
    expect(lfoNode.disconnect).toHaveBeenCalledWith(param);
  });

  it("disconnects a future voice and its LFO edge on transport stop", () => {
    const { instrument, lfoNode, param, source } = setupVoice(1);

    instrument.cancelFutureNotes();
    instrument.cancelFutureNotes();

    expect(source.stop).toHaveBeenCalledOnce();
    expect(source.stop).toHaveBeenCalledWith(0);
    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(source.onended).toBeNull();
    expect(lfoNode.disconnect).toHaveBeenCalledOnce();
    expect(lfoNode.disconnect).toHaveBeenCalledWith(param);
  });

  it("does not disconnect an active voice LFO on transport stop", () => {
    const { instrument, lfoNode, param, source } = setupVoice(0);

    instrument.cancelFutureNotes();

    expect(lfoNode.disconnect).not.toHaveBeenCalled();

    source.fireEnded();
    expect(lfoNode.disconnect).toHaveBeenCalledWith(param);
  });

  it("disconnects voice edges before shared LFO nodes on destruction", () => {
    const { instrument, lfoNode, param } = setupVoice(0);

    instrument.destroy();
    instrument.destroy();

    expect(lfoNode.disconnect.mock.calls).toEqual([[param], []]);
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

  it("preserves active voice bindings on transport stop", () => {
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
    const source = new FakeSourceNode();
    instrument.track(source, [], 0, bindings);

    instrument.cancelFutureNotes();

    expect(signal.subscriberCount).toBe(1);
    source.fireEnded();
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
