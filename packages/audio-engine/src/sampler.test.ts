import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BankSchema,
  EnvelopeSchema,
  ParameterSchema,
  SamplerSchema,
  StaticSchema,
} from "@web-audio/schema";
import Sampler from "./sampler";

class FakeAudioParam {
  value = 0;
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
}

class FakeGainNode {
  gain = new FakeAudioParam();
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeBufferSourceNode {
  buffer: AudioBuffer | null;
  playbackRate = { value: 1 };
  detune = new FakeAudioParam();
  loop: boolean;
  onended: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  connect = vi.fn();
  disconnect = vi.fn();

  constructor(
    _ctx: AudioContext,
    options: {
      buffer: AudioBuffer;
      playbackRate: number;
      detune?: number;
      loop?: boolean;
    },
  ) {
    this.buffer = options.buffer;
    this.playbackRate.value = options.playbackRate;
    this.detune.value = options.detune ?? 0;
    this.loop = options.loop ?? false;
  }
}

class FakeAudioContext {
  currentTime = 0;
  destination = {} as AudioDestinationNode;
  decodedBuffers: AudioBuffer[] = [];
  decodeAudioData = vi.fn(async () => this.decodedBuffers.shift() ?? null);
  createGain() {
    return new FakeGainNode();
  }
}

class FakeClock {
  barDuration = 2;
}

function staticParam(value: number): StaticSchema {
  return {
    type: "static",
    polyphonic: false,
    cycle: [[{ value, offset: 0, duration: 1, stepIndex: 0 }]],
  };
}

function staticPattern(
  value: number,
  offset = 0,
  duration = 1,
  stepIndex = 0,
): StaticSchema {
  return {
    type: "static",
    polyphonic: false,
    cycle: [[{ value, offset, duration, stepIndex }]],
  };
}

function envelope(max = 1, r = 0): EnvelopeSchema {
  return {
    type: "envelope",
    min: 0,
    max: staticParam(max),
    a: staticParam(0),
    d: staticParam(0),
    s: staticParam(1),
    r: staticParam(r),
    mode: "bleed",
  };
}

function makeSchema(overrides: Partial<SamplerSchema> = {}): SamplerSchema {
  return {
    type: "sampler",
    bank: "kit",
    sample: "bd",
    variation: staticParam(0),
    notes: staticPattern(1),
    detune: staticParam(0),
    gain: envelope(),
    effects: [],
    loop: false,
    ...overrides,
  };
}

function makeBanks(url = "https://example.com/bd.wav"): Record<string, BankSchema> {
  return {
    kit: {
      samples: {
        bd: [url],
      },
    },
  };
}

function makeBuffer(duration: number) {
  return { duration } as AudioBuffer;
}

describe("Sampler", () => {
  let ctx: FakeAudioContext;
  let clock: FakeClock;
  let cache: {
    resolved: Map<string, AudioBuffer>;
    promises: Map<string, Promise<AudioBuffer | null>>;
  };
  let createdSources: FakeBufferSourceNode[];
  let createdGains: FakeGainNode[];
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();

    ctx = new FakeAudioContext();
    clock = new FakeClock();
    cache = {
      resolved: new Map(),
      promises: new Map(),
    };
    createdSources = [];
    createdGains = [];

    function MockGainNode(this: FakeGainNode) {
      const node = new FakeGainNode();
      createdGains.push(node);
      return node;
    }

    function MockAudioBufferSourceNode(
      this: FakeBufferSourceNode,
      audioCtx: AudioContext,
      options: ConstructorParameters<typeof FakeBufferSourceNode>[1],
    ) {
      const node = new FakeBufferSourceNode(audioCtx, options);
      createdSources.push(node);
      return node;
    }

    globalThis.GainNode = vi.fn(MockGainNode) as unknown as typeof GainNode;
    globalThis.AudioBufferSourceNode = vi.fn(
      MockAudioBufferSourceNode,
    ) as unknown as typeof AudioBufferSourceNode;

    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("load() resolves the URL from banks and populates the buffer", async () => {
    const url = "https://example.com/bd.wav";
    const buffer = makeBuffer(1.25);
    ctx.decodedBuffers.push(buffer);
    globalThis.fetch = vi.fn(async () => ({
      arrayBuffer: async () => new ArrayBuffer(8),
    })) as unknown as typeof fetch;

    const sampler = new Sampler(ctx as unknown as AudioContext, clock as never, {
      schema: makeSchema(),
      banks: makeBanks(url),
      cache,
    });

    expect(sampler.isReady()).toBe(false);
    await sampler.load();

    expect(globalThis.fetch).toHaveBeenCalledWith(url);
    expect(ctx.decodeAudioData).toHaveBeenCalledOnce();
    expect(sampler.isReady()).toBe(true);
    expect(cache.resolved.get(url)).toBe(buffer);
  });

  it("load() warns on fetch failure and leaves the sampler unready", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network failed");
    }) as unknown as typeof fetch;

    const sampler = new Sampler(ctx as unknown as AudioContext, clock as never, {
      schema: makeSchema(),
      banks: makeBanks(),
      cache,
    });

    await sampler.load();

    expect(sampler.isReady()).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load "kit/bd"'),
    );
  });

  it("load() uses the resolved cache synchronously", async () => {
    const url = "https://example.com/bd.wav";
    cache.resolved.set(url, makeBuffer(0.75));
    globalThis.fetch = vi.fn() as unknown as typeof fetch;

    const sampler = new Sampler(ctx as unknown as AudioContext, clock as never, {
      schema: makeSchema(),
      banks: makeBanks(url),
      cache,
    });

    const loadPromise = sampler.load();

    expect(sampler.isReady()).toBe(true);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    await loadPromise;
  });

  it("deduplicates concurrent fetches through the shared promise cache", async () => {
    const url = "https://example.com/shared.wav";
    const buffer = makeBuffer(1.5);
    ctx.decodedBuffers.push(buffer);
    globalThis.fetch = vi.fn(async () => ({
      arrayBuffer: async () => new ArrayBuffer(8),
    })) as unknown as typeof fetch;

    const a = new Sampler(ctx as unknown as AudioContext, clock as never, {
      schema: makeSchema(),
      banks: makeBanks(url),
      cache,
    });
    const b = new Sampler(ctx as unknown as AudioContext, clock as never, {
      schema: makeSchema(),
      banks: makeBanks(url),
      cache,
    });

    await Promise.all([a.load(), b.load()]);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(1);
    expect(a.isReady()).toBe(true);
    expect(b.isReady()).toBe(true);
  });

  it("scheduleBar() warns and returns early when the sampler is not ready", () => {
    const sampler = new Sampler(ctx as unknown as AudioContext, clock as never, {
      schema: makeSchema(),
      banks: makeBanks(),
      cache,
    });

    sampler.scheduleBar(0, 10);

    expect(warnSpy).toHaveBeenCalledWith(
      '[Sampler] "kit/bd" not yet loaded — skipping bar 0',
    );
    expect(createdSources).toHaveLength(0);
  });

  it("uses a fallback buffer until the requested sample finishes loading", async () => {
    const fallback = makeBuffer(0.5);
    const target = makeBuffer(1);
    let resolveFetch!: (response: { arrayBuffer: () => Promise<ArrayBuffer> }) => void;
    const fetchPromise = new Promise<{ arrayBuffer: () => Promise<ArrayBuffer> }>(
      (resolve) => {
        resolveFetch = resolve;
      },
    );
    ctx.decodedBuffers.push(target);
    globalThis.fetch = vi.fn(() => fetchPromise) as unknown as typeof fetch;

    const banks = {
      kit: {
        samples: {
          bd: ["https://example.com/old.wav", "https://example.com/new.wav"],
        },
      },
    };
    const loadingSampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({ variation: staticParam(1) }),
        banks,
        cache,
        fallbackBuffer: fallback,
      },
    );

    const loadPromise = loadingSampler.load();
    loadingSampler.scheduleBar(0, 10);
    expect(createdSources[0].buffer).toBe(fallback);

    resolveFetch({ arrayBuffer: async () => new ArrayBuffer(8) });
    await loadPromise;

    loadingSampler.scheduleBar(1, 12);
    expect(createdSources[1].buffer).toBe(target);
  });

  it("scheduleBar() creates a buffer source with the resolved playbackRate, loop flag, and timing", async () => {
    const url = "https://example.com/bd.wav";
    const buffer = makeBuffer(2);
    cache.resolved.set(url, buffer);
    const notes: ParameterSchema = staticPattern(2, 0.25, 0.5, 0);

    const sampler = new Sampler(ctx as unknown as AudioContext, clock as never, {
      schema: makeSchema({ notes, loop: true }),
      banks: makeBanks(url),
      cache,
    });

    await sampler.load();
    sampler.scheduleBar(0, 10);

    expect(createdSources).toHaveLength(1);
    const source = createdSources[0];
    expect(source.playbackRate.value).toBe(2);
    expect(source.loop).toBe(true);
    expect(source.start).toHaveBeenCalledWith(10.5);
    expect(source.stop.mock.calls[0][0]).toBeCloseTo(11.555);

    expect(createdGains).toHaveLength(1);
    const gain = createdGains[0];
    expect(gain.gain.setValueAtTime).toHaveBeenCalled();
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalled();
  });

  it("fit() computes playbackRate from buffer duration and target bars", async () => {
    const url = "https://example.com/loop.wav";
    const buffer = makeBuffer(1);
    cache.resolved.set(url, buffer);

    const sampler = new Sampler(ctx as unknown as AudioContext, clock as never, {
      schema: makeSchema({
        sample: "bd",
        notes: { type: "fit", bars: 1 },
      }),
      banks: makeBanks(url),
      cache,
    });

    await sampler.load();
    sampler.scheduleBar(0, 12);

    expect(createdSources).toHaveLength(1);
    const source = createdSources[0];
    expect(source.playbackRate.value).toBeCloseTo(0.5);
    expect(source.start).toHaveBeenCalledWith(12);
    expect(source.stop).toHaveBeenCalledWith(14);
  });

  it("fit() only triggers at the start of each N-bar window", async () => {
    const url = "https://example.com/loop.wav";
    cache.resolved.set(url, makeBuffer(2));

    const sampler = new Sampler(ctx as unknown as AudioContext, clock as never, {
      schema: makeSchema({ notes: { type: "fit", bars: 2 } }),
      banks: makeBanks(url),
      cache,
    });

    await sampler.load();
    sampler.scheduleBar(1, 10);
    expect(createdSources).toHaveLength(0);

    sampler.scheduleBar(2, 14);
    expect(createdSources).toHaveLength(1);
    expect(createdSources[0].start).toHaveBeenCalledWith(14);
    expect(createdSources[0].stop).toHaveBeenCalledWith(18);
  });
});
