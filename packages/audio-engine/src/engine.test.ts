import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DromeSchema } from "@web-audio/schema";

// Mock Synthesizer so tests don't need Web Audio APIs.
// Must use a regular function (not arrow) so it's usable as a constructor.
vi.mock("./instruments/synthesizer", () => {
  function MockSynthesizer(this: Record<string, unknown>) {
    this.scheduleBar = vi.fn();
    this.cancelFutureNotes = vi.fn();
    let resolve: () => void;
    this.done = new Promise<void>((r) => {
      resolve = r;
    });
    this._resolveDone = () => resolve();
  }
  return { default: vi.fn(MockSynthesizer) };
});

vi.mock("./instruments/sampler", () => {
  function MockSampler(
    this: Record<string, unknown>,
    _ctx: unknown,
    _clock: unknown,
    opts: { cache: { resolved: Map<string, unknown> } },
  ) {
    this.scheduleBar = vi.fn();
    this.cancelFutureNotes = vi.fn();
    this.isReady = vi.fn(() => true);
    this.load = vi.fn();
    this.fallbackBufferFor = vi.fn(() => null);
    this._cache = opts.cache;
    let resolve: () => void;
    this.done = new Promise<void>((r) => {
      resolve = r;
    });
    this._resolveDone = () => resolve();
  }
  return { default: vi.fn(MockSampler) };
});

import AudioEngine from "./index";
import MockSynthesizer from "./instruments/synthesizer";
import MockSampler from "./instruments/sampler";

// Stub AudioContext with audioWorklet.addModule for worklet registration
const fakeCtx = {
  audioWorklet: { addModule: () => Promise.resolve() },
  decodeAudioData: vi.fn(async () => ({ duration: 1 }) as AudioBuffer),
} as unknown as AudioContext;

type EventCallback = (m: { beat: number; bar: number }, time: number) => void;

// Controllable clock stub — lets tests fire events manually
class FakeClock {
  paused = true;
  barDuration = 2;
  private _listeners = new Map<string, Set<EventCallback>>();

  on(type: string, fn: EventCallback): () => void {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type)!.add(fn);
    return () => this._listeners.get(type)?.delete(fn);
  }

  emit(type: string, bar = 0, time = 0) {
    this._listeners.get(type)?.forEach((cb) => cb({ beat: 0, bar }, time));
  }
}

// Minimal schema fixture — Synthesizer is mocked so instruments don't need to
// be valid; only the array length matters for instrument creation.
function makeSchema(instrumentCount = 1): DromeSchema {
  return {
    instruments: Array.from({ length: instrumentCount }, () => ({}) as never),
    banks: {},
  };
}

function makeSamplerSchema(): DromeSchema {
  return {
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
          type: "static",
          polyphonic: false,
          cycle: [[{ value: 1, offset: 0, duration: 1, stepIndex: 0 }]],
        },
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
        loop: false,
        durationMode: "clip",
      },
    ],
    banks: {
      kit: { samples: { bd: ["https://example.com/bd.wav"] } },
    },
  };
}

function instances() {
  return vi.mocked(MockSynthesizer).mock.instances as unknown as Array<{
    scheduleBar: ReturnType<typeof vi.fn>;
    cancelFutureNotes: ReturnType<typeof vi.fn>;
    done: Promise<void>;
    _resolveDone: () => void;
  }>;
}

function samplerInstances() {
  return vi.mocked(MockSampler).mock.instances as unknown as Array<{
    scheduleBar: ReturnType<typeof vi.fn>;
    cancelFutureNotes: ReturnType<typeof vi.fn>;
    load: ReturnType<typeof vi.fn>;
    isReady: ReturnType<typeof vi.fn>;
    fallbackBufferFor: ReturnType<typeof vi.fn>;
    _cache: { resolved: Map<string, unknown> };
    done: Promise<void>;
    _resolveDone: () => void;
  }>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AudioEngine", () => {
  describe("update() always defers to prebar", () => {
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
    it("retires old instruments on hot-swap and removes them when done resolves", async () => {
      const clock = new FakeClock();
      clock.paused = false;
      const engine = new AudioEngine(fakeCtx, clock as never);

      engine.update(makeSchema(1));
      clock.emit("prebar"); // instrument[0] created

      engine.update(makeSchema(1));
      clock.emit("prebar"); // instrument[0] retired, instrument[1] created

      // i1 should not be retired yet
      const [i0, i1] = instances();

      // Resolving i0.done should not throw (removes it from _retiring)
      i0._resolveDone();
      await Promise.resolve();

      // inst is the active instrument — its done should not have been resolved
      let i1Resolved = false;
      i1.done.then(() => {
        i1Resolved = true;
      });
      await Promise.resolve();
      expect(i1Resolved).toBe(false);
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
  });

  describe("destroy()", () => {
    it("unsubscribes from clock events so subsequent events have no effect", () => {
      const clock = new FakeClock();
      clock.paused = false;
      const engine = new AudioEngine(fakeCtx, clock as never);

      engine.update(makeSchema());
      clock.emit("prebar");
      engine.destroy();

      // After destroy, bar events must not call scheduleBar
      clock.emit("bar");
      expect(instances()[0].scheduleBar).not.toHaveBeenCalled();
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
      schema.banks.kit.samples.bd = [
        "https://example.com/bd-0.wav",
        "https://example.com/bd-1.wav",
        "https://example.com/bd-2.wav",
        "https://example.com/bd-3.wav",
      ];
      const fetchMock = vi.fn(async () => ({
        arrayBuffer: async () => new ArrayBuffer(8),
      }));
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      engine.update(schema);
      await engine.prepare();

      expect(fetchMock).toHaveBeenCalledTimes(4);
      schema.banks.kit.samples.bd.forEach((url) => {
        expect(fetchMock).toHaveBeenCalledWith(url);
      });
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

      // Resolve first sampler's done so retirement completes
      firstSampler._resolveDone();

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
