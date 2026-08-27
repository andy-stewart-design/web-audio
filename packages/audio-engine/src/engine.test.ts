import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Midi } from "@web-audio/midi";
import type { DromeSchema, StaticSchema } from "@web-audio/schema";

// Mock Synthesizer so tests don't need Web Audio APIs.
// Must use a regular function (not arrow) so it's usable as a constructor.
vi.mock("./instruments/synthesizer", () => {
  function MockSynthesizer(
    this: Record<string, unknown>,
    _ctx: unknown,
    _clock: unknown,
    opts: {
      schema?: unknown;
      destination?: unknown;
      routing?: unknown;
      midiOutputScheduler?: unknown;
    },
  ) {
    this.scheduleBar = vi.fn();
    this.cancelFutureNotes = vi.fn();
    this.connectMidi = vi.fn();
    this.disconnectMidi = vi.fn();
    this.retire = vi.fn();
    this.destroy = vi.fn();
    this._schema = opts.schema;
    this._destination = opts.destination;
    this._destinationGainAtConstruction = (
      opts.destination as { gain?: { value: number } }
    ).gain?.value;
    this._routing = opts.routing;
    this._midiOutputScheduler = opts.midiOutputScheduler;
    let resolve: () => void;
    this.finished = new Promise<void>((r) => {
      resolve = r;
    });
    this._resolveFinished = () => resolve();
  }
  return { default: vi.fn(MockSynthesizer) };
});

vi.mock("./instruments/sampler", () => {
  function MockSampler(
    this: Record<string, unknown>,
    _ctx: unknown,
    _clock: unknown,
    opts: {
      schema?: unknown;
      banks?: unknown;
      cache: { resolved: Map<string, unknown> };
      destination?: unknown;
      routing?: unknown;
    },
  ) {
    this.scheduleBar = vi.fn();
    this.cancelFutureNotes = vi.fn();
    this.connectMidi = vi.fn();
    this.disconnectMidi = vi.fn();
    this.retire = vi.fn();
    this.destroy = vi.fn();
    this._schema = opts.schema;
    this._banks = opts.banks;
    this._destination = opts.destination;
    this._routing = opts.routing;
    this.isReady = vi.fn(() => true);
    this.load = vi.fn();
    this.fallbackBufferFor = vi.fn(() => null);
    this._cache = opts.cache;
    let resolve: () => void;
    this.finished = new Promise<void>((r) => {
      resolve = r;
    });
    this._resolveFinished = () => resolve();
  }
  return { default: vi.fn(MockSampler) };
});

import AudioEngine from "./index";
import MockSynthesizer from "./instruments/synthesizer";
import MockSampler from "./instruments/sampler";

class FakeAudioNode {
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
}

class FakeGainNode extends FakeAudioNode {
  gain = { value: 1 };
}

class FakeAudioParam {
  value = 0;
}

class FakeFilterNode extends FakeAudioNode {
  static instances: FakeFilterNode[] = [];
  frequency = new FakeAudioParam();
  Q = new FakeAudioParam();
  detune = new FakeAudioParam();
  gain = new FakeAudioParam();
  type: BiquadFilterType;

  constructor(_ctx: AudioContext, options: BiquadFilterOptions = {}) {
    super();
    this.type = options.type ?? "lowpass";
    FakeFilterNode.instances.push(this);
  }
}

const createAnalyserMock = vi.fn(() => new FakeAudioNode());
const createGainMock = vi.fn(() => new FakeGainNode());
const destinationNode = new FakeAudioNode();

// Stub AudioContext with audioWorklet.addModule for worklet registration
const fakeCtx = {
  currentTime: 0,
  audioWorklet: { addModule: () => Promise.resolve() },
  decodeAudioData: vi.fn(async () => ({ duration: 1 }) as AudioBuffer),
  destination: destinationNode,
  createAnalyser: createAnalyserMock,
  createGain: createGainMock,
} as unknown as AudioContext;

type EventCallback = (m: { beat: number; bar: number }, time: number) => void;

// Controllable clock stub — lets tests fire events manually
class FakeClock {
  ctx = fakeCtx;
  paused = true;
  barDuration = 2;
  schedulingLeadTime = 0.1;
  schedulingInterval = 0.025;
  beatsPerMin = 120;
  private _listeners = new Map<string, Set<EventCallback>>();

  on(type: string, fn: EventCallback): () => void {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type)!.add(fn);
    return () => this._listeners.get(type)?.delete(fn);
  }

  emit(type: string, bar = 0, time = 0) {
    this._listeners.get(type)?.forEach((cb) => cb({ beat: 0, bar }, time));
  }

  bpm(value: number) {
    this.beatsPerMin = value;
  }

  audioTimeToMIDITime(time: number) {
    return time * 1000;
  }
}

// Minimal schema fixture — Synthesizer is mocked so instruments don't need to
// be valid; only the array length matters for instrument creation.
function staticParam(...values: number[]): StaticSchema {
  return {
    type: "static",
    polyphonic: false,
    cycle: values.map((value) => [
      { value, offset: 0, duration: 1, stepIndex: 0 },
    ]),
  };
}

function makeSchema(instrumentCount = 1): DromeSchema {
  return {
    bpm: undefined,
    instruments: Array.from(
      { length: instrumentCount },
      () => ({ route: "main", sends: {} }) as never,
    ),
    banks: {},
    buses: {},
  };
}

function makeSamplerSchema(): DromeSchema {
  return {
    bpm: undefined,
    instruments: [
      {
        type: "sampler",
        bank: "kit",
        sample: "bd",
        variation: {
          type: "static",
          polyphonic: false,
          cycle: [[{ value: 0, offset: 0, duration: 1, stepIndex: 0 }]],
        },
        notes: {
          source: {
            type: "static",
            polyphonic: false,
            cycle: [[{ value: 1, offset: 0, duration: 1, stepIndex: 0 }]],
          },
        },
        fit: null,
        region: null,
        sourceKeys: [0],
        detune: {
          type: "static",
          polyphonic: false,
          cycle: [[{ value: 0, offset: 0, duration: 1, stepIndex: 0 }]],
        },
        gain: {
          type: "envelope",
          min: 0,
          max: {
            type: "static",
            polyphonic: false,
            cycle: [[{ value: 1, offset: 0, duration: 1, stepIndex: 0 }]],
          },
          a: {
            type: "static",
            polyphonic: false,
            cycle: [[{ value: 0, offset: 0, duration: 1, stepIndex: 0 }]],
          },
          d: {
            type: "static",
            polyphonic: false,
            cycle: [[{ value: 0, offset: 0, duration: 1, stepIndex: 0 }]],
          },
          s: {
            type: "static",
            polyphonic: false,
            cycle: [[{ value: 1, offset: 0, duration: 1, stepIndex: 0 }]],
          },
          r: {
            type: "static",
            polyphonic: false,
            cycle: [[{ value: 0, offset: 0, duration: 1, stepIndex: 0 }]],
          },
          mode: "bleed",
        },
        effects: [],
        muted: false,
        route: "main",
        sends: {},
        loop: false,
        clipMode: "clipped",
        direction: "forward",
      },
    ],
    banks: {
      kit: {
        samples: {
          bd: {
            "0": [{ type: "file", src: "https://example.com/bd.wav" }],
          },
        },
      },
    },
    buses: {},
  };
}

function instances() {
  return vi.mocked(MockSynthesizer).mock.instances as unknown as Array<{
    scheduleBar: ReturnType<typeof vi.fn>;
    cancelFutureNotes: ReturnType<typeof vi.fn>;
    connectMidi: ReturnType<typeof vi.fn>;
    disconnectMidi: ReturnType<typeof vi.fn>;
    retire: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    finished: Promise<void>;
    _destination: unknown;
    _schema: unknown;
    _routing: {
      primary: unknown;
      sends: { destination: unknown; amount: number }[];
    };
    _midiOutputScheduler: unknown;
    _destinationGainAtConstruction: number | undefined;
    _resolveFinished: () => void;
  }>;
}

function samplerInstances() {
  return vi.mocked(MockSampler).mock.instances as unknown as Array<{
    scheduleBar: ReturnType<typeof vi.fn>;
    cancelFutureNotes: ReturnType<typeof vi.fn>;
    connectMidi: ReturnType<typeof vi.fn>;
    disconnectMidi: ReturnType<typeof vi.fn>;
    retire: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    load: ReturnType<typeof vi.fn>;
    isReady: ReturnType<typeof vi.fn>;
    fallbackBufferFor: ReturnType<typeof vi.fn>;
    _schema: unknown;
    _banks: unknown;
    _cache: { resolved: Map<string, unknown> };
    finished: Promise<void>;
    _destination: unknown;
    _routing: {
      primary: unknown;
      sends: { destination: unknown; amount: number }[];
    };
    _resolveFinished: () => void;
  }>;
}

const midiInstance = () => ({}) as Midi;

beforeEach(() => {
  vi.clearAllMocks();
  FakeFilterNode.instances = [];
  vi.stubGlobal("BiquadFilterNode", FakeFilterNode);
});

describe("AudioEngine", () => {
  describe("output graph", () => {
    it("creates a master output and analyser for final mixed output", () => {
      const clock = new FakeClock();
      const engine = new AudioEngine(fakeCtx, clock as never);
      const master = createGainMock.mock.results[0]?.value;
      const analyser = createAnalyserMock.mock.results[0]?.value;

      expect(engine.getAnalyser()).toBe(analyser);
      expect(master.connect).toHaveBeenCalledWith(destinationNode);
      expect(master.connect).toHaveBeenCalledWith(analyser);
    });

    it("updates persistent main gain at commit and defaults missing buses to unity", () => {
      const clock = new FakeClock();
      const engine = new AudioEngine(fakeCtx, clock as never);
      const master = createGainMock.mock.results[0]?.value;
      const configured = makeSchema();
      configured.buses = { main: { gain: 0.6, effects: [] } };

      engine.update(configured);
      expect(master.gain.value).toBe(1);
      clock.emit("prebar");
      expect(master.gain.value).toBe(0.6);
      expect(instances()[0]._destinationGainAtConstruction).toBe(0.6);

      engine.update(makeSchema());
      clock.emit("prebar");
      expect(master.gain.value).toBe(1);
      expect(createGainMock).toHaveBeenCalledOnce();
    });

    it("rejects main and dynamic named-bus effects without replacing the active graph", () => {
      const clock = new FakeClock();
      const engine = new AudioEngine(fakeCtx, clock as never);
      engine.update(makeSchema());
      clock.emit("prebar");
      const active = instances()[0];
      const withMainEffect = makeSchema();
      withMainEffect.buses = {
        main: { gain: 1, effects: [{ type: "gain" } as never] },
      };
      const withDynamicNamedEffect = makeSchema();
      withDynamicNamedEffect.buses = {
        drums: {
          gain: 1,
          effects: [{ type: "gain", gain: { type: "random" } as never }],
        },
      };

      expect(() => engine.update(withMainEffect)).toThrow(
        "[Schema] Effects on main are not supported in the bus MVP.",
      );
      expect(() => engine.update(withDynamicNamedEffect)).toThrow(
        '[Schema] Bus "drums" effects[0].gain must be a finite bar-resolvable static parameter.',
      );

      clock.emit("bar");
      expect(active.scheduleBar).toHaveBeenCalledOnce();
      expect(active.retire).not.toHaveBeenCalled();
    });

    it("rejects invalid direct main gain values", () => {
      const engine = new AudioEngine(fakeCtx, new FakeClock() as never);
      const schema = makeSchema();
      schema.buses = { main: { gain: Number.NaN, effects: [] } };

      expect(() => engine.update(schema)).toThrow(
        '[Schema] Bus "main" gain must be a finite number greater than or equal to 0.',
      );
    });

    it("routes an instrument exclusively to a named bus feeding main", () => {
      const clock = new FakeClock();
      const engine = new AudioEngine(fakeCtx, clock as never);
      const schema = makeSchema();
      schema.buses = { drums: { gain: 0.75, effects: [] } };
      schema.instruments[0].route = "drums";
      const master = createGainMock.mock.results[0]?.value;

      engine.update(schema);
      clock.emit("prebar");

      const input = createGainMock.mock.results[1]?.value;
      const output = createGainMock.mock.results[2]?.value;
      expect(instances()[0]._destination).toBe(input);
      expect(instances()[0]._destination).not.toBe(master);
      expect(input.connect).toHaveBeenCalledWith(output);
      expect(output.gain.value).toBe(0.75);
      expect(output.connect).toHaveBeenCalledWith(master);
    });

    it("sums multiple routed instruments into the same named bus input", () => {
      const clock = new FakeClock();
      const engine = new AudioEngine(fakeCtx, clock as never);
      const schema = makeSchema(2);
      schema.buses = { drums: { gain: 1, effects: [] } };
      schema.instruments.forEach((instrument) => {
        instrument.route = "drums";
      });

      engine.update(schema);
      clock.emit("prebar");

      const input = createGainMock.mock.results[1]?.value;
      expect(instances()[0]._destination).toBe(input);
      expect(instances()[1]._destination).toBe(input);
    });

    it("resolves primary and send destinations independently", () => {
      const clock = new FakeClock();
      const engine = new AudioEngine(fakeCtx, clock as never);
      const schema = makeSchema();
      schema.buses = {
        drums: { gain: 1, effects: [] },
        verb: { gain: 1, effects: [] },
      };
      schema.instruments[0].route = "drums";
      schema.instruments[0].sends = { verb: 0.3 };

      engine.update(schema);
      clock.emit("prebar");

      const drumsInput = createGainMock.mock.results[1]?.value;
      const verbInput = createGainMock.mock.results[3]?.value;
      expect(instances()[0]._routing).toEqual({
        primary: drumsInput,
        sends: [{ destination: verbInput, amount: 0.3 }],
      });
    });

    it("rejects invalid direct sends", () => {
      const engine = new AudioEngine(fakeCtx, new FakeClock() as never);
      const schema = makeSchema();
      schema.buses = { verb: { gain: 1, effects: [] } };

      schema.instruments[0].sends = { main: 0.2 };
      expect(() => engine.update(schema)).toThrow(
        "[Schema] Instrument 0 send cannot target main.",
      );
      schema.instruments[0].sends = { missing: 0.2 };
      expect(() => engine.update(schema)).toThrow(
        '[Schema] Instrument 0 send "missing" does not reference a declared bus.',
      );
      schema.instruments[0].sends = { verb: 2 };
      expect(() => engine.update(schema)).toThrow(
        '[Schema] Instrument 0 send "verb" amount must be a finite number in [0, 1].',
      );
    });

    it("rejects unresolved and non-canonical direct routes", () => {
      const engine = new AudioEngine(fakeCtx, new FakeClock() as never);
      const unresolved = makeSchema();
      unresolved.instruments[0].route = "drums";
      const nonCanonical = makeSchema();
      nonCanonical.instruments[0].route = " main ";

      expect(() => engine.update(unresolved)).toThrow(
        '[Schema] Instrument 0 route "drums" does not reference a declared bus.',
      );
      expect(() => engine.update(nonCanonical)).toThrow(
        '[Schema] Instrument 0 route " main " is not canonical.',
      );
    });

    it("builds the reference group/send topology without dry duplication", () => {
      const clock = new FakeClock();
      const engine = new AudioEngine(fakeCtx, clock as never);
      const schema = makeSchema(3);
      schema.buses = {
        main: { gain: 0.9, effects: [] },
        drums: {
          gain: 0.8,
          effects: [
            {
              type: "filter",
              filterType: "lp",
              frequency: staticParam(8_000),
              q: staticParam(1),
              detune: staticParam(0),
              gain: staticParam(0),
            },
          ],
        },
        verb: { gain: 0.5, effects: [] },
      };
      Object.assign(schema.instruments[0], {
        type: "sampler",
        route: "drums",
        sends: { verb: 0.1 },
      });
      Object.assign(schema.instruments[1], {
        type: "sampler",
        route: "drums",
        sends: { verb: 0.4 },
      });
      Object.assign(schema.instruments[2], {
        route: "main",
        sends: { verb: 0.2 },
      });

      engine.update(schema);
      clock.emit("prebar");

      const master = createGainMock.mock.results[0]?.value;
      const drumsInput = createGainMock.mock.results[1]?.value;
      const drumsOutput = createGainMock.mock.results[2]?.value;
      const verbInput = createGainMock.mock.results[3]?.value;
      const verbOutput = createGainMock.mock.results[4]?.value;
      const filter = FakeFilterNode.instances[0];

      expect(samplerInstances()[0]._routing).toEqual({
        primary: drumsInput,
        sends: [{ destination: verbInput, amount: 0.1 }],
      });
      expect(samplerInstances()[1]._routing).toEqual({
        primary: drumsInput,
        sends: [{ destination: verbInput, amount: 0.4 }],
      });
      expect(instances()[0]._routing).toEqual({
        primary: master,
        sends: [{ destination: verbInput, amount: 0.2 }],
      });
      expect(drumsInput.connect).toHaveBeenCalledOnce();
      expect(drumsInput.connect).toHaveBeenCalledWith(filter);
      expect(filter.connect).toHaveBeenCalledWith(drumsOutput);
      expect(verbInput.connect).toHaveBeenCalledWith(verbOutput);
      expect(drumsOutput.connect).toHaveBeenCalledWith(master);
      expect(verbOutput.connect).toHaveBeenCalledWith(master);
      expect(master.connect).toHaveBeenCalledWith(destinationNode);
      expect(drumsOutput.connect).not.toHaveBeenCalledWith(destinationNode);
      expect(verbOutput.connect).not.toHaveBeenCalledWith(destinationNode);
    });

    it("passes the master output to synthesizers instead of ctx.destination", () => {
      const clock = new FakeClock();
      const engine = new AudioEngine(fakeCtx, clock as never);
      const master = createGainMock.mock.results[0]?.value;

      engine.update(makeSchema());
      clock.emit("prebar");

      expect(instances()[0]._destination).toBe(master);
      expect(instances()[0]._destination).not.toBe(destinationNode);
    });

    it("passes the engine MIDI output scheduler to synthesizers", () => {
      const clock = new FakeClock();
      const engine = new AudioEngine(fakeCtx, clock as never);

      engine.update(makeSchema());
      clock.emit("prebar");

      expect(instances()[0]._midiOutputScheduler).toBeDefined();
    });

    it("passes the master output to samplers instead of ctx.destination", () => {
      const clock = new FakeClock();
      const engine = new AudioEngine(fakeCtx, clock as never);
      const master = createGainMock.mock.results[0]?.value;

      engine.update(makeSamplerSchema());
      clock.emit("prebar");

      expect(samplerInstances()[0]._destination).toBe(master);
      expect(samplerInstances()[0]._destination).not.toBe(destinationNode);
    });
  });

  describe("update() always defers to prebar", () => {
    it("resets BPM to 120 when the next schema does not configure it", () => {
      const clock = new FakeClock();
      const engine = new AudioEngine(fakeCtx, clock as never);
      const configured = makeSchema();
      configured.bpm = 90;

      engine.update(configured);
      clock.emit("prebar");
      expect(clock.beatsPerMin).toBe(90);

      engine.update(makeSchema());
      clock.emit("prebar");
      expect(clock.beatsPerMin).toBe(120);
    });

    it("commits an isolated copy of nested graph data", () => {
      const clock = new FakeClock();
      const engine = new AudioEngine(fakeCtx, clock as never);
      const schema = makeSchema();
      schema.buses = {
        drums: {
          gain: 0.75,
          effects: [
            {
              type: "filter",
              filterType: "lp",
              frequency: staticParam(800),
              q: staticParam(1),
              detune: staticParam(0),
              gain: staticParam(0),
            },
          ],
        },
        verb: { gain: 0.5, effects: [] },
      };
      schema.instruments[0].route = "drums";
      schema.instruments[0].sends = { verb: 0.2 };

      engine.update(schema);
      schema.buses.drums.gain = 0;
      const effect = schema.buses.drums.effects[0];
      if (effect.type !== "filter" || effect.frequency.type !== "static") {
        expect.unreachable();
      }
      effect.frequency.cycle[0][0].value = 2_000;
      schema.instruments[0].route = "main";
      schema.instruments[0].sends.verb = 0.9;
      clock.emit("prebar");

      const drumsInput = createGainMock.mock.results[1]?.value;
      const drumsOutput = createGainMock.mock.results[2]?.value;
      const verbInput = createGainMock.mock.results[3]?.value;
      expect(instances()[0]._routing).toEqual({
        primary: drumsInput,
        sends: [{ destination: verbInput, amount: 0.2 }],
      });
      expect(drumsOutput.gain.value).toBe(0.75);
      expect(FakeFilterNode.instances[0].frequency.value).toBe(800);
    });

    it("isolates nested bank data from caller mutation", () => {
      const clock = new FakeClock();
      const engine = new AudioEngine(fakeCtx, clock as never);
      const schema = makeSamplerSchema();

      engine.update(schema);
      schema.banks.kit.samples.bd["0"][0].src = "mutated.wav";
      clock.emit("prebar");

      expect(samplerInstances()[0]._banks).toEqual({
        kit: {
          samples: {
            bd: {
              "0": [{ type: "file", src: "https://example.com/bd.wav" }],
            },
          },
        },
      });
    });

    it("does not create pending state for an invalid update", () => {
      const clock = new FakeClock();
      const engine = new AudioEngine(fakeCtx, clock as never);
      const invalid = makeSchema();
      invalid.instruments[0].route = "missing";

      expect(() => engine.update(invalid)).toThrow();
      clock.emit("prebar");

      expect(instances()).toHaveLength(0);
    });

    it("preserves a valid pending update when a later update is invalid", () => {
      const clock = new FakeClock();
      const engine = new AudioEngine(fakeCtx, clock as never);
      engine.update(makeSchema(2));
      const invalid = makeSchema();
      invalid.instruments[0].route = "missing";

      expect(() => engine.update(invalid)).toThrow(
        '[Schema] Instrument 0 route "missing" does not reference a declared bus.',
      );
      clock.emit("prebar");

      expect(instances()).toHaveLength(2);
    });

    it("preserves a valid pending update when cloning fails", () => {
      const clock = new FakeClock();
      const engine = new AudioEngine(fakeCtx, clock as never);
      engine.update(makeSchema(2));
      const unclonable = Object.assign(makeSchema(), { callback: () => {} });

      expect(() => engine.update(unclonable)).toThrow();
      clock.emit("prebar");

      expect(instances()).toHaveLength(2);
    });

    it("does not commit until prebar fires, even when paused", () => {
      const clock = new FakeClock();
      const engine = new AudioEngine(fakeCtx, clock as never);

      engine.update(makeSchema());
      clock.emit("bar"); // no prebar yet — nothing committed

      expect(instances()).toHaveLength(0);
    });

    it("commits on prebar and schedules on the subsequent bar", () => {
      const clock = new FakeClock();
      const engine = new AudioEngine(fakeCtx, clock as never);

      engine.update(makeSchema());
      clock.emit("prebar");
      clock.emit("bar");

      expect(instances()[0].scheduleBar).toHaveBeenCalledOnce();
    });

    it("last update wins when called multiple times before prebar", () => {
      const clock = new FakeClock();
      const engine = new AudioEngine(fakeCtx, clock as never);

      engine.update(makeSchema(1));
      engine.update(makeSchema(1)); // only this one should commit
      clock.emit("prebar");
      clock.emit("bar");

      expect(instances()).toHaveLength(1);
      expect(instances()[0].scheduleBar).toHaveBeenCalledOnce();
    });
  });

  describe("update() with running clock (last-write-wins before prebar)", () => {
    it("defers commit until prebar fires", () => {
      const clock = new FakeClock();
      clock.paused = false;
      const engine = new AudioEngine(fakeCtx, clock as never);

      engine.update(makeSchema());
      clock.emit("bar"); // no commit yet — prebar hasn't fired

      expect(instances()).toHaveLength(0);
    });

    it("commits on prebar and schedules on the subsequent bar", () => {
      const clock = new FakeClock();
      clock.paused = false;
      const engine = new AudioEngine(fakeCtx, clock as never);

      engine.update(makeSchema());
      clock.emit("prebar"); // _commit() fires
      expect(instances()).toHaveLength(1);
      expect(instances()[0].scheduleBar).not.toHaveBeenCalled();

      clock.emit("bar");
      expect(instances()[0].scheduleBar).toHaveBeenCalledOnce();
    });

    it("only the last schema is committed when update() is called twice before prebar", () => {
      const clock = new FakeClock();
      clock.paused = false;
      const engine = new AudioEngine(fakeCtx, clock as never);

      engine.update(makeSchema(1)); // pending = schema1
      engine.update(makeSchema(1)); // pending = schema2 (schema1 discarded)
      clock.emit("prebar"); // commits schema2 only → 1 instrument created

      expect(instances()).toHaveLength(1);

      clock.emit("bar");
      expect(instances()[0].scheduleBar).toHaveBeenCalledOnce();
    });

    it("multi-instrument schema creates one instrument per instrument", () => {
      const clock = new FakeClock();
      clock.paused = false;
      const engine = new AudioEngine(fakeCtx, clock as never);

      engine.update(makeSchema(3));
      clock.emit("prebar");
      clock.emit("bar");

      expect(instances()).toHaveLength(3);
      instances().forEach((p) => expect(p.scheduleBar).toHaveBeenCalledOnce());
    });
  });

  describe("prebar → bar hot-swap window", () => {
    it("instruments exist after prebar but have no scheduled audio until bar fires", () => {
      const clock = new FakeClock();
      clock.paused = false;
      const engine = new AudioEngine(fakeCtx, clock as never);

      engine.update(makeSchema());
      clock.emit("prebar");

      expect(instances()).toHaveLength(1);
      expect(instances()[0].scheduleBar).not.toHaveBeenCalled();
    });

    it("bar passes its index to scheduleBar", () => {
      const clock = new FakeClock();
      clock.paused = false;
      const engine = new AudioEngine(fakeCtx, clock as never);

      engine.update(makeSchema());
      clock.emit("prebar");
      clock.emit("bar", 5, 10);

      expect(instances()[0].scheduleBar).toHaveBeenCalledWith(5, 10);
    });
  });

  describe("retirement", () => {
    it("retires old instruments on hot-swap and removes them when finished resolves", async () => {
      const clock = new FakeClock();
      clock.paused = false;
      const engine = new AudioEngine(fakeCtx, clock as never);

      engine.update(makeSchema(1));
      clock.emit("prebar"); // instrument[0] created

      engine.update(makeSchema(1));
      clock.emit("prebar"); // instrument[0] retired, instrument[1] created

      // i1 should not be retired yet
      const [i0, i1] = instances();
      expect(i0.retire).toHaveBeenCalledOnce();

      // Resolving i0.finished removes it from retirement and destroys its graph.
      i0._resolveFinished();
      await Promise.resolve();
      await Promise.resolve();
      expect(i0.destroy).toHaveBeenCalledOnce();

      // inst is the active instrument — its finished should not have been resolved
      let i1Resolved = false;
      i1.finished.then(() => {
        i1Resolved = true;
      });
      await Promise.resolve();
      expect(i1Resolved).toBe(false);
    });
  });

  describe("bus retirement", () => {
    it("applies new global main gain while the previous graph retires", () => {
      const clock = new FakeClock();
      const engine = new AudioEngine(fakeCtx, clock as never);
      const first = makeSchema();
      first.buses = { main: { gain: 0.5, effects: [] } };
      const second = makeSchema();
      second.buses = { main: { gain: 0.8, effects: [] } };
      const master = createGainMock.mock.results[0]?.value;

      engine.update(first);
      clock.emit("prebar");
      engine.update(second);
      clock.emit("prebar");

      expect(instances()[0].retire).toHaveBeenCalledOnce();
      expect(instances()[0].destroy).not.toHaveBeenCalled();
      expect(master.gain.value).toBe(0.8);
    });

    it("keeps an old named bus until every instrument in its graph finishes", async () => {
      const clock = new FakeClock();
      const engine = new AudioEngine(fakeCtx, clock as never);
      const routed = makeSchema();
      routed.buses = { drums: { gain: 1, effects: [] } };
      routed.instruments[0].route = "drums";

      engine.update(routed);
      clock.emit("prebar");
      const oldInput = createGainMock.mock.results[1]?.value;
      const oldOutput = createGainMock.mock.results[2]?.value;

      engine.update(makeSchema());
      clock.emit("prebar");
      expect(oldInput.disconnect).not.toHaveBeenCalled();
      expect(oldOutput.disconnect).not.toHaveBeenCalled();

      instances()[0]._resolveFinished();
      await Promise.resolve();
      await Promise.resolve();

      expect(oldInput.disconnect).toHaveBeenCalledOnce();
      expect(oldOutput.disconnect).toHaveBeenCalledOnce();
    });
  });

  describe("construction failure", () => {
    it("keeps the active graph and restores main gain when replacement bus construction fails", () => {
      const clock = new FakeClock();
      const engine = new AudioEngine(fakeCtx, clock as never);
      const initial = makeSchema();
      initial.buses = { main: { gain: 0.4, effects: [] } };
      engine.update(initial);
      clock.emit("prebar");
      const active = instances()[0];
      const master = createGainMock.mock.results[0]?.value;
      const replacement = makeSchema();
      replacement.buses = {
        main: { gain: 0.8, effects: [] },
        drums: { gain: 1, effects: [] },
      };
      createGainMock.mockImplementationOnce(() => {
        throw new Error("allocation failed");
      });

      engine.update(replacement);
      expect(() => clock.emit("prebar")).toThrow("allocation failed");

      expect(active.retire).not.toHaveBeenCalled();
      expect(master.gain.value).toBe(0.4);
      clock.emit("bar");
      expect(active.scheduleBar).toHaveBeenCalledOnce();
    });
  });

  describe("MIDI lifecycle", () => {
    it("connects MIDI to instruments that are already active", () => {
      const clock = new FakeClock();
      const engine = new AudioEngine(fakeCtx, clock as never);
      engine.update(makeSchema());
      clock.emit("prebar");
      const midi = midiInstance();

      engine.connectMidi(midi);

      expect(instances()[0].connectMidi).toHaveBeenCalledWith(midi);
    });

    it("connects new instruments when MIDI was connected before commit", () => {
      const clock = new FakeClock();
      const engine = new AudioEngine(fakeCtx, clock as never);
      const midi = midiInstance();
      engine.connectMidi(midi);

      engine.update(makeSchema());
      clock.emit("prebar");

      expect(instances()[0].connectMidi).toHaveBeenCalledWith(midi);
    });

    it("treats the same instance as a no-op and tears down replacements", () => {
      const clock = new FakeClock();
      const engine = new AudioEngine(fakeCtx, clock as never);
      engine.update(makeSchema());
      clock.emit("prebar");
      const first = midiInstance();
      const second = midiInstance();

      engine.connectMidi(first);
      engine.connectMidi(first);
      expect(instances()[0].connectMidi).toHaveBeenCalledTimes(1);

      engine.connectMidi(second);
      expect(instances()[0].disconnectMidi).toHaveBeenCalledTimes(1);
      expect(instances()[0].connectMidi).toHaveBeenLastCalledWith(second);
    });

    it("disconnects active bindings explicitly and on destroy", () => {
      const clock = new FakeClock();
      const engine = new AudioEngine(fakeCtx, clock as never);
      engine.update(makeSchema());
      clock.emit("prebar");

      engine.connectMidi(midiInstance());
      engine.disconnectMidi();
      expect(instances()[0].disconnectMidi).toHaveBeenCalledTimes(1);

      engine.connectMidi(midiInstance());
      engine.destroy();
      expect(instances()[0].disconnectMidi).toHaveBeenCalledTimes(2);
    });
  });

  describe("stop event", () => {
    it("cancels future notes on all active instruments", () => {
      const clock = new FakeClock();
      clock.paused = false;
      const engine = new AudioEngine(fakeCtx, clock as never);

      engine.update(makeSchema(2));
      clock.emit("prebar");
      clock.emit("stop");

      instances().forEach((p) =>
        expect(p.cancelFutureNotes).toHaveBeenCalledOnce(),
      );
    });

    it("cancels future notes on active and retiring graphs", () => {
      const clock = new FakeClock();
      const engine = new AudioEngine(fakeCtx, clock as never);
      engine.update(makeSchema());
      clock.emit("prebar");
      engine.update(makeSchema());
      clock.emit("prebar");

      clock.emit("stop");

      expect(instances()[0].cancelFutureNotes).toHaveBeenCalledOnce();
      expect(instances()[1].cancelFutureNotes).toHaveBeenCalledOnce();
    });
  });

  describe("destroy()", () => {
    it("unsubscribes from clock events so subsequent events have no effect", () => {
      const clock = new FakeClock();
      clock.paused = false;
      const engine = new AudioEngine(fakeCtx, clock as never);

      engine.update(makeSchema());
      clock.emit("prebar");
      engine.destroy();
      expect(instances()[0].destroy).toHaveBeenCalledOnce();

      // After destroy, bar events must not call scheduleBar
      clock.emit("bar");
      expect(instances()[0].scheduleBar).not.toHaveBeenCalled();
    });

    it("disconnects the master output and analyser", () => {
      const clock = new FakeClock();
      const engine = new AudioEngine(fakeCtx, clock as never);
      const master = createGainMock.mock.results[0]?.value;
      const analyser = createAnalyserMock.mock.results[0]?.value;

      engine.destroy();

      expect(master.disconnect).toHaveBeenCalledOnce();
      expect(analyser.disconnect).toHaveBeenCalledOnce();
    });
  });

  describe("prepare()", () => {
    it("preloads all statically known sampler variations before playback", async () => {
      const clock = new FakeClock();
      const engine = new AudioEngine(fakeCtx, clock as never);
      const schema = makeSamplerSchema();
      const sampler = schema.instruments[0];
      if (sampler.type !== "sampler") expect.unreachable();
      sampler.variation = {
        type: "static",
        polyphonic: false,
        cycle: [
          [
            { value: 0, offset: 0, duration: 0.25, stepIndex: 0 },
            { value: 1, offset: 0.25, duration: 0.25, stepIndex: 1 },
            { value: 2, offset: 0.5, duration: 0.25, stepIndex: 2 },
            { value: 3, offset: 0.75, duration: 0.25, stepIndex: 3 },
          ],
        ],
      };
      schema.banks.kit.samples.bd = {
        "0": [
          { type: "file", src: "https://example.com/bd-0.wav" },
          { type: "file", src: "https://example.com/bd-1.wav" },
          { type: "file", src: "https://example.com/bd-2.wav" },
          { type: "file", src: "https://example.com/bd-3.wav" },
        ],
      };
      const fetchMock = vi.fn(async () => ({
        arrayBuffer: async () => new ArrayBuffer(8),
      }));
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      engine.update(schema);
      await engine.prepare();

      expect(fetchMock).toHaveBeenCalledTimes(4);
      schema.banks.kit.samples.bd["0"].forEach((entry) => {
        expect(fetchMock).toHaveBeenCalledWith(entry.src);
      });
    });

    it("preloads every source key × variation combination", async () => {
      const clock = new FakeClock();
      const engine = new AudioEngine(fakeCtx, clock as never);
      const schema = makeSamplerSchema();
      const sampler = schema.instruments[0];
      if (sampler.type !== "sampler") expect.unreachable();
      sampler.sourceKeys = [45, 57, 69];
      sampler.variation = {
        type: "static",
        polyphonic: false,
        cycle: [
          [
            { value: 0, offset: 0, duration: 0.5, stepIndex: 0 },
            { value: 1, offset: 0.5, duration: 0.5, stepIndex: 1 },
          ],
        ],
      };
      schema.banks.kit.samples.bd = {
        "45": [
          { type: "file", src: "https://example.com/45-0.wav" },
          { type: "file", src: "https://example.com/45-1.wav" },
        ],
        "57": [
          { type: "file", src: "https://example.com/57-0.wav" },
          { type: "file", src: "https://example.com/57-1.wav" },
        ],
        "69": [
          { type: "file", src: "https://example.com/69-0.wav" },
          { type: "file", src: "https://example.com/69-1.wav" },
        ],
      };
      const fetchMock = vi.fn(async () => ({
        arrayBuffer: async () => new ArrayBuffer(8),
      }));
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      engine.update(schema);
      await engine.prepare();

      expect(fetchMock).toHaveBeenCalledTimes(6);
      for (const sourceKey of sampler.sourceKeys) {
        for (const variationIndex of [0, 1]) {
          expect(fetchMock).toHaveBeenCalledWith(
            `https://example.com/${sourceKey}-${variationIndex}.wav`,
          );
        }
      }
    });

    it("deduplicates duplicate URLs while preloading source keys", async () => {
      const clock = new FakeClock();
      const engine = new AudioEngine(fakeCtx, clock as never);
      const schema = makeSamplerSchema();
      const sampler = schema.instruments[0];
      if (sampler.type !== "sampler") expect.unreachable();
      sampler.sourceKeys = [45, 57];
      schema.banks.kit.samples.bd = {
        "45": [
          {
            type: "sprite",
            src: "https://example.com/kit.wav",
            start: 0,
            end: 0.1,
          },
        ],
        "57": [
          {
            type: "sprite",
            src: "https://example.com/kit.wav",
            start: 0.2,
            end: 0.3,
          },
        ],
      };
      const fetchMock = vi.fn(async () => ({
        arrayBuffer: async () => new ArrayBuffer(8),
      }));
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      engine.update(schema);
      await engine.prepare();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith("https://example.com/kit.wav");
    });
  });

  describe("sampler buffer cache", () => {
    it("persists across _commit() calls — re-commit with same sampler does not re-fetch", () => {
      const clock = new FakeClock();
      clock.paused = false;
      const engine = new AudioEngine(fakeCtx, clock as never);

      const schema = makeSamplerSchema();

      // First commit
      engine.update(schema);
      clock.emit("prebar");

      const firstSampler = samplerInstances()[0];
      expect(firstSampler.load).toHaveBeenCalledOnce();

      // Resolve first sampler's finished so retirement completes
      firstSampler._resolveFinished();

      // Second commit with the same schema
      engine.update(schema);
      clock.emit("prebar");

      const secondSampler = samplerInstances()[1];
      expect(secondSampler.load).toHaveBeenCalledOnce();

      // Both samplers received the same cache object
      expect(secondSampler._cache).toBe(firstSampler._cache);
    });
  });
});
