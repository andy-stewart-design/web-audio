import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BankSchema,
  EnvelopeSchema,
  FilterSchema,
  ParameterSchema,
  RandomSchema,
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

class FakeBiquadFilterNode {
  frequency = new FakeAudioParam();
  Q = new FakeAudioParam();
  detune = new FakeAudioParam();
  gain = new FakeAudioParam();
  connect = vi.fn();
  disconnect = vi.fn();

  constructor(_ctx: AudioContext, _options?: { type?: BiquadFilterType }) {
    void _ctx;
    void _options;
  }
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

  fireEnded() {
    this.onended?.();
  }

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
  createdContextGains: FakeGainNode[] = [];
  decodeAudioData = vi.fn(async () => this.decodedBuffers.shift() ?? null);
  createGain() {
    const node = new FakeGainNode();
    this.createdContextGains.push(node);
    return node;
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

function randomNotes(): RandomSchema {
  return {
    type: "random",
    dataType: "float",
    segments: [{ seed: 42 }],
    quantValue: undefined,
    range: undefined,
    algorithm: "xor",
    valueMap: [0.5, 1.5],
    cycle: {
      type: "static",
      polyphonic: false,
      cycle: [
        [
          { value: 1, offset: 0, duration: 0.5, stepIndex: 0 },
          { value: 0, offset: 0.5, duration: 0.5, stepIndex: 1 },
        ],
      ],
    },
  };
}

function lowpassEffect(frequency = 800): FilterSchema {
  return {
    type: "filter",
    filterType: "lp",
    frequency: staticParam(frequency),
    q: staticParam(1),
    detune: staticParam(0),
    gain: staticParam(1),
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
    clipMode: "clipped",
    ...overrides,
  };
}

function makeBanks(
  url = "https://example.com/bd.wav",
): Record<string, BankSchema> {
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
  let createdFilters: FakeBiquadFilterNode[];
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
    createdFilters = [];

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

    function MockBiquadFilterNode(
      this: FakeBiquadFilterNode,
      audioCtx: AudioContext,
      options?: { type?: BiquadFilterType },
    ) {
      const node = new FakeBiquadFilterNode(audioCtx, options);
      createdFilters.push(node);
      return node;
    }

    globalThis.GainNode = vi.fn(MockGainNode) as unknown as typeof GainNode;
    globalThis.AudioBufferSourceNode = vi.fn(
      MockAudioBufferSourceNode,
    ) as unknown as typeof AudioBufferSourceNode;
    globalThis.BiquadFilterNode = vi.fn(
      MockBiquadFilterNode,
    ) as unknown as typeof BiquadFilterNode;

    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("load() resolves the URL from banks and populates the buffer", async () => {
    const url = "https://example.com/bd.wav";
    const buffer = makeBuffer(1.25);
    ctx.decodedBuffers.push(buffer);
    globalThis.fetch = vi.fn(async () => ({
      arrayBuffer: async () => new ArrayBuffer(8),
    })) as unknown as typeof fetch;

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema(),
        banks: makeBanks(url),
        cache,
      },
    );

    expect(sampler.isReady()).toBe(false);
    await sampler.load();

    expect(globalThis.fetch).toHaveBeenCalledWith(url);
    expect(ctx.decodeAudioData).toHaveBeenCalledOnce();
    expect(sampler.isReady()).toBe(true);
    expect(cache.resolved.get(url)).toBe(buffer);
  });

  it("load() resolves the URL for the selected variation index", async () => {
    const urls = [
      "https://example.com/bd-0.wav",
      "https://example.com/bd-1.wav",
    ];
    const buffer = makeBuffer(1);
    ctx.decodedBuffers.push(buffer);
    globalThis.fetch = vi.fn(async () => ({
      arrayBuffer: async () => new ArrayBuffer(8),
    })) as unknown as typeof fetch;

    const banks = makeBanks(urls[0]);
    banks.kit.samples.bd = urls;
    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({ variation: staticParam(1) }),
        banks,
        cache,
      },
    );

    await sampler.load();

    expect(globalThis.fetch).toHaveBeenCalledWith(urls[1]);
    expect(cache.resolved.get(urls[1])).toBe(buffer);
  });

  it("load() falls back to variation 0 when the requested variation is out of range", async () => {
    const urls = ["https://example.com/bd-0.wav"];
    const buffer = makeBuffer(1);
    ctx.decodedBuffers.push(buffer);
    globalThis.fetch = vi.fn(async () => ({
      arrayBuffer: async () => new ArrayBuffer(8),
    })) as unknown as typeof fetch;

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({ variation: staticParam(99) }),
        banks: makeBanks(urls[0]),
        cache,
      },
    );

    await sampler.load();

    expect(globalThis.fetch).toHaveBeenCalledWith(urls[0]);
    expect(cache.resolved.get(urls[0])).toBe(buffer);
  });

  it("load() preloads all statically known variation indices", async () => {
    const urls = [
      "https://example.com/bd-0.wav",
      "https://example.com/bd-1.wav",
      "https://example.com/bd-2.wav",
      "https://example.com/bd-3.wav",
    ];
    const buffers = urls.map((_, i) => makeBuffer(1 + i / 10));
    ctx.decodedBuffers.push(...buffers);
    globalThis.fetch = vi.fn(async () => ({
      arrayBuffer: async () => new ArrayBuffer(8),
    })) as unknown as typeof fetch;
    const banks = makeBanks(urls[0]);
    banks.kit.samples.bd = urls;

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({ variation: staticCycle([0, 1, 2, 3]) }),
        banks,
        cache,
      },
    );

    await sampler.load();

    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
    urls.forEach((url, i) => {
      expect(globalThis.fetch).toHaveBeenCalledWith(url);
      expect(cache.resolved.get(url)).toBe(buffers[i]);
    });
  });

  it("load() warns on fetch failure and leaves the sampler unready", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network failed");
    }) as unknown as typeof fetch;

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema(),
        banks: makeBanks(),
        cache,
      },
    );

    await sampler.load();

    expect(sampler.isReady()).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load "kit/bd"'),
    );
  });

  it("load() warns when the bank is missing from schema", async () => {
    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({ bank: "missing" }),
        banks: makeBanks(),
        cache,
      },
    );

    await sampler.load();

    expect(sampler.isReady()).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      '[Sampler] Bank "missing" not found in schema',
    );
  });

  it("load() warns when the sample is missing from the bank", async () => {
    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({ sample: "sn" }),
        banks: makeBanks(),
        cache,
      },
    );

    await sampler.load();

    expect(sampler.isReady()).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      '[Sampler] Sample "sn" not found in bank "kit"',
    );
  });

  it("load() uses the resolved cache synchronously", async () => {
    const url = "https://example.com/bd.wav";
    cache.resolved.set(url, makeBuffer(0.75));
    globalThis.fetch = vi.fn() as unknown as typeof fetch;

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema(),
        banks: makeBanks(url),
        cache,
      },
    );

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
    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema(),
        banks: makeBanks(),
        cache,
      },
    );

    sampler.scheduleBar(0, 10);

    expect(warnSpy).toHaveBeenCalledWith(
      '[Sampler] "kit/bd" not yet loaded — skipping bar 0',
    );
    expect(createdSources).toHaveLength(0);
  });

  it("uses a fallback buffer until the requested sample finishes loading", async () => {
    const fallback = makeBuffer(0.5);
    const target = makeBuffer(1);
    let resolveFetch!: (response: {
      arrayBuffer: () => Promise<ArrayBuffer>;
    }) => void;
    const fetchPromise = new Promise<{
      arrayBuffer: () => Promise<ArrayBuffer>;
    }>((resolve) => {
      resolveFetch = resolve;
    });
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

  it("scheduleBar() uses preloaded static variations without first-bar skips", async () => {
    const urls = [
      "https://example.com/bd-0.wav",
      "https://example.com/bd-1.wav",
      "https://example.com/bd-2.wav",
    ];
    const buffers = [makeBuffer(1), makeBuffer(1.1), makeBuffer(1.2)];
    ctx.decodedBuffers.push(...buffers);
    globalThis.fetch = vi.fn(async () => ({
      arrayBuffer: async () => new ArrayBuffer(8),
    })) as unknown as typeof fetch;
    const banks = makeBanks(urls[0]);
    banks.kit.samples.bd = urls;

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          notes: staticCycle([1, 1, 1]),
          variation: staticCycle([0, 1, 2]),
        }),
        banks,
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);

    expect(createdSources).toHaveLength(3);
    expect(createdSources.map((s) => s.buffer)).toEqual(buffers);
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("not yet loaded"),
    );
  });

  it("does not re-fetch a variation that has already been loaded", async () => {
    const urls = [
      "https://example.com/bd-0.wav",
      "https://example.com/bd-1.wav",
    ];
    const buffers = [makeBuffer(1), makeBuffer(1.1)];
    cache.resolved.set(urls[0], buffers[0]);
    ctx.decodedBuffers.push(buffers[1]);
    globalThis.fetch = vi.fn(async () => ({
      arrayBuffer: async () => new ArrayBuffer(8),
    })) as unknown as typeof fetch;
    const banks = makeBanks(urls[0]);
    banks.kit.samples.bd = urls;

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          notes: staticCycle([1, 1]),
          variation: staticCycle([1, 1]),
        }),
        banks,
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);
    sampler.scheduleBar(1, 12);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(createdSources).toHaveLength(4);
    expect(createdSources.map((s) => s.buffer)).toEqual([
      buffers[1],
      buffers[1],
      buffers[1],
      buffers[1],
    ]);
  });

  it("scheduleBar() creates a buffer source with the resolved playbackRate, detune, loop flag, and timing", async () => {
    const url = "https://example.com/bd.wav";
    const buffer = makeBuffer(2);
    cache.resolved.set(url, buffer);
    const notes: ParameterSchema = staticPattern(2, 0.25, 0.5, 0);

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({ notes, detune: staticParam(123), loop: true }),
        banks: makeBanks(url),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);

    expect(createdSources).toHaveLength(1);
    const source = createdSources[0];
    const noteDuration = 0.5 * clock.barDuration;
    const startTime = 10 + 0.25 * clock.barDuration;
    const endTime = startTime + noteDuration;
    const releaseDur = 0.0025;

    expect(source.playbackRate.value).toBe(2);
    expect(source.detune.value).toBe(123);
    expect(source.loop).toBe(true);
    expect(source.start).toHaveBeenCalledWith(startTime);
    expect(source.stop).toHaveBeenCalledWith(endTime + releaseDur + 0.05);

    expect(createdGains).toHaveLength(1);
    const gain = createdGains[0];
    expect(gain.gain.setValueAtTime).toHaveBeenNthCalledWith(1, 0, startTime);
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenNthCalledWith(
      1,
      1,
      startTime + 0.0025,
    );
    expect(gain.gain.linearRampToValueAtTime.mock.calls[1][0]).toBe(1);
    expect(gain.gain.linearRampToValueAtTime.mock.calls[1][1]).toBeCloseTo(
      startTime + 0.005,
    );
    expect(gain.gain.setValueAtTime).toHaveBeenNthCalledWith(2, 1, endTime);
    expect(gain.gain.linearRampToValueAtTime.mock.calls[2][0]).toBe(0);
    expect(gain.gain.linearRampToValueAtTime.mock.calls[2][1]).toBeCloseTo(
      endTime + releaseDur,
    );
  });

  it("scheduleBar() lets one-shot samples play through their full duration", async () => {
    const url = "https://example.com/oh.wav";
    cache.resolved.set(url, makeBuffer(3));
    const notes: ParameterSchema = staticPattern(2, 0.25, 0.5, 0);

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({ notes, clipMode: "one-shot" }),
        banks: makeBanks(url),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);

    const startTime = 10 + 0.25 * clock.barDuration;
    const sampleDuration = 3 / 2;
    const endTime = startTime + sampleDuration;
    const releaseDur = 0.0025;
    const source = createdSources[0];

    expect(source.start).toHaveBeenCalledWith(startTime);
    expect(source.stop).toHaveBeenCalledWith(endTime + releaseDur + 0.05);

    const gain = createdGains[0];
    expect(gain.gain.setValueAtTime).toHaveBeenNthCalledWith(2, 1, endTime);
    expect(gain.gain.linearRampToValueAtTime.mock.calls[2][1]).toBeCloseTo(
      endTime + releaseDur,
    );
  });

  it("scheduleBar() handles random notes and skips masked-out steps", async () => {
    const url = "https://example.com/bd.wav";
    cache.resolved.set(url, makeBuffer(1));

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({ notes: randomNotes() }),
        banks: makeBanks(url),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 8);

    expect(createdSources).toHaveLength(1);
    expect(createdSources[0].start).toHaveBeenCalledWith(8);
    expect([0.5, 1.5]).toContain(createdSources[0].playbackRate.value);
  });

  it("scheduleBar() schedules all notes in a multi-step bar", async () => {
    const url = "https://example.com/bd.wav";
    cache.resolved.set(url, makeBuffer(1));
    const notes: ParameterSchema = {
      type: "static",
      polyphonic: false,
      cycle: [
        [
          { value: 1, offset: 0, duration: 0.25, stepIndex: 0 },
          { value: 2, offset: 0.5, duration: 0.25, stepIndex: 1 },
        ],
      ],
    };

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({ notes }),
        banks: makeBanks(url),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 4);

    expect(createdSources).toHaveLength(2);
    expect(createdSources[0].playbackRate.value).toBe(1);
    expect(createdSources[0].start).toHaveBeenCalledWith(4);
    expect(createdSources[1].playbackRate.value).toBe(2);
    expect(createdSources[1].start).toHaveBeenCalledWith(5);
  });

  it("scheduleBar() builds and wires an effect chain", async () => {
    const url = "https://example.com/bd.wav";
    cache.resolved.set(url, makeBuffer(1));

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({ effects: [lowpassEffect(1200)] }),
        banks: makeBanks(url),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 6);

    expect(createdSources).toHaveLength(1);
    expect(createdGains).toHaveLength(1);
    expect(createdFilters).toHaveLength(1);
    expect(createdSources[0].connect).toHaveBeenCalledWith(createdGains[0]);
    expect(createdGains[0].connect).toHaveBeenCalledWith(createdFilters[0]);
    expect(createdFilters[0].frequency.setValueAtTime).toHaveBeenCalledWith(
      1200,
      6,
    );
  });

  it("fit() computes playbackRate from buffer duration and target bars", async () => {
    const url = "https://example.com/loop.wav";
    const buffer = makeBuffer(1);
    cache.resolved.set(url, buffer);

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          sample: "bd",
          notes: { type: "fit", bars: 1 },
        }),
        banks: makeBanks(url),
        cache,
      },
    );

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

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({ notes: { type: "fit", bars: 2 } }),
        banks: makeBanks(url),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(1, 10);
    expect(createdSources).toHaveLength(0);

    sampler.scheduleBar(2, 14);
    expect(createdSources).toHaveLength(1);
    expect(createdSources[0].start).toHaveBeenCalledWith(14);
    expect(createdSources[0].stop).toHaveBeenCalledWith(18);
  });

  it("done resolves after the scheduled source ends", async () => {
    cache.resolved.set("https://example.com/bd.wav", makeBuffer(1));
    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema(),
        banks: makeBanks(),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 2);

    let resolved = false;
    sampler.done.then(() => {
      resolved = true;
    });

    expect(resolved).toBe(false);
    createdSources[0].fireEnded();
    await Promise.resolve();
    expect(resolved).toBe(true);
    expect(createdSources[0].disconnect).toHaveBeenCalled();
    expect(createdGains[0].disconnect).toHaveBeenCalled();
  });

  it("cancelFutureNotes() stops future scheduled notes and resolves done", async () => {
    ctx.currentTime = 0;
    cache.resolved.set("https://example.com/bd.wav", makeBuffer(1));
    const notes: ParameterSchema = staticPattern(1, 0.75, 0.25, 0);

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({ notes }),
        banks: makeBanks(),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 2);
    sampler.cancelFutureNotes();

    let resolved = false;
    sampler.done.then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(createdSources[0].stop).toHaveBeenCalledWith(0);
    expect(createdSources[0].disconnect).toHaveBeenCalled();
    expect(createdGains[0].disconnect).toHaveBeenCalled();
    expect(resolved).toBe(true);
  });
});
