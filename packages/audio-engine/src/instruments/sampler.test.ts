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
import RandomResolver from "@/resolvers/random-resolver";
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
  loopStart: number;
  loopEnd: number;
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
      loopStart?: number;
      loopEnd?: number;
    },
  ) {
    this.buffer = options.buffer;
    this.playbackRate.value = options.playbackRate;
    this.detune.value = options.detune ?? 0;
    this.loop = options.loop ?? false;
    this.loopStart = options.loopStart ?? 0;
    this.loopEnd = options.loopEnd ?? 0;
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

function randomSchema(valueMap: number[]): RandomSchema {
  return {
    type: "random",
    dataType: "float",
    segments: [{ seed: 42 }],
    quantValue: undefined,
    range: undefined,
    algorithm: "xor",
    valueMap,
    grid: {
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

function randomNotes(): RandomSchema {
  return randomSchema([0.5, 1.5]);
}

function randomValueCycle(valueMap: number[]): RandomSchema {
  return {
    type: "random",
    dataType: "float",
    segments: [{ seed: 42 }],
    quantValue: undefined,
    range: undefined,
    algorithm: "xor",
    valueMap,
    grid: staticCycle(valueMap.map(() => 1)),
  };
}

function sparseMask(): StaticSchema {
  return {
    type: "static",
    polyphonic: false,
    cycle: [
      [
        { value: 1, offset: 0, duration: 0.25, stepIndex: 0 },
        { value: 1, offset: 0.5, duration: 0.25, stepIndex: 2 },
      ],
    ],
  };
}

function sparseRandomMask(): RandomSchema {
  return {
    type: "random",
    dataType: "binary",
    chance: 1,
    segments: [{ seed: 42 }],
    quantValue: undefined,
    range: undefined,
    algorithm: "xor",
    grid: sparseMask(),
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

type SchemaOverrides = Omit<Partial<SamplerSchema>, "notes"> & {
  notes?: ParameterSchema;
  mask?: ParameterSchema;
};

function makeSchema(overrides: SchemaOverrides = {}): SamplerSchema {
  const { notes, mask, route = "main", sends = {}, ...rest } = overrides;

  return {
    type: "sampler",
    bank: "kit",
    sample: "bd",
    variation: staticParam(0),
    notes: {
      source: notes ?? staticPattern(1),
      mask: mask,
    },
    fit: null,
    region: null,
    sourceKeys: [0],
    detune: staticParam(0),
    gain: envelope(),
    effects: [],
    muted: false,
    route,
    sends,
    loop: false,
    clipMode: "clipped",
    direction: "forward",
    ...rest,
  };
}

function makeBanks(
  url = "https://example.com/bd.wav",
): Record<string, BankSchema> {
  return {
    kit: {
      samples: {
        bd: { "0": [{ type: "file", src: url }] },
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
    reversed: WeakMap<AudioBuffer, AudioBuffer>;
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
      reversed: new WeakMap(),
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
    banks.kit.samples.bd = {
      "0": urls.map((src) => ({ type: "file" as const, src })),
    };
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
    banks.kit.samples.bd = {
      "0": urls.map((src) => ({ type: "file" as const, src })),
    };

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
          bd: {
            "0": [
              { type: "file" as const, src: "https://example.com/old.wav" },
              { type: "file" as const, src: "https://example.com/new.wav" },
            ],
          },
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
    banks.kit.samples.bd = {
      "0": urls.map((src) => ({ type: "file" as const, src })),
    };

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
    banks.kit.samples.bd = {
      "0": urls.map((src) => ({ type: "file" as const, src })),
    };

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

  it("scheduleBar() creates a buffer source with computed playbackRate, detune, loop flag, and timing", async () => {
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

    expect(source.playbackRate.value).toBeCloseTo(Math.pow(2, 2 / 12));
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

  it("looping samples use step duration for the gain envelope", async () => {
    const url = "https://example.com/hh.wav";
    cache.resolved.set(url, makeBuffer(0.25));

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          loop: true,
          notes: staticPattern(0, 0, 1),
        }),
        banks: makeBanks(url),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);

    const stepEndTime = 10 + clock.barDuration;
    expect(createdGains[0].gain.setValueAtTime).toHaveBeenNthCalledWith(
      2,
      1,
      stepEndTime,
    );
    expect(createdSources[0].stop).toHaveBeenCalledWith(
      stepEndTime + 0.0025 + 0.05,
    );
  });

  it("static file regions schedule offset and selected duration", async () => {
    const url = "https://example.com/loop.wav";
    cache.resolved.set(url, makeBuffer(2));

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          notes: staticPattern(0, 0, 1),
          region: {
            type: "static",
            start: staticParam(0.5),
            end: staticParam(1),
          },
        }),
        banks: makeBanks(url),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);

    expect(createdSources).toHaveLength(1);
    expect(createdSources[0].start).toHaveBeenCalledWith(10, 1);
    expect(createdSources[0].stop).toHaveBeenCalledWith(11.0025 + 0.05);
  });

  it("reverse playback uses the prepared buffer and maps whole-buffer offset", async () => {
    const url = "https://example.com/loop.wav";
    const original = makeBuffer(4);
    const reversed = makeBuffer(4);
    cache.resolved.set(url, original);
    cache.reversed.set(original, reversed);

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          direction: "reverse",
          notes: staticPattern(0),
        }),
        banks: makeBanks(url),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);

    expect(createdSources[0].buffer).toBe(reversed);
    expect(createdSources[0].playbackRate.value).toBe(1);
    expect(createdSources[0].start).toHaveBeenCalledWith(10, 0);
  });

  it("reverse playback maps absolute regions in forward coordinates", async () => {
    const url = "https://example.com/loop.wav";
    const original = makeBuffer(4);
    const reversed = makeBuffer(4);
    cache.resolved.set(url, original);
    cache.reversed.set(original, reversed);

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          direction: "reverse",
          notes: staticPattern(0),
          region: {
            type: "static",
            start: staticParam(0.25),
            end: staticParam(0.5),
          },
        }),
        banks: makeBanks(url),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);

    expect(createdSources[0].buffer).toBe(reversed);
    expect(createdSources[0].start).toHaveBeenCalledWith(10, 2);
  });

  it("reverse playback maps relative-duration regions in forward coordinates", async () => {
    const url = "https://example.com/loop.wav";
    const original = makeBuffer(4);
    const reversed = makeBuffer(4);
    cache.resolved.set(url, original);
    cache.reversed.set(original, reversed);

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          direction: "reverse",
          notes: staticPattern(0),
          region: {
            type: "static",
            start: staticParam(0.25),
            duration: staticParam(0.1),
          },
        }),
        banks: makeBanks(url),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);

    expect(createdSources[0].buffer).toBe(reversed);
    expect(createdSources[0].playbackRate.value).toBe(1);
    expect(createdSources[0].start).toHaveBeenCalledWith(10, 2.6);
  });

  it("reverse playback maps clamped duration regions", async () => {
    const url = "https://example.com/loop.wav";
    const original = makeBuffer(4);
    const reversed = makeBuffer(4);
    cache.resolved.set(url, original);
    cache.reversed.set(original, reversed);

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          direction: "reverse",
          notes: staticPattern(0),
          region: {
            type: "static",
            start: staticParam(0.8),
            duration: staticParam(0.3),
          },
        }),
        banks: makeBanks(url),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);

    expect(createdSources[0].start).toHaveBeenCalledWith(10, 0);
  });

  it("reverse playback maps sprite-relative regions onto the full buffer", async () => {
    const url = "https://example.com/kit.wav";
    const original = makeBuffer(8);
    const reversed = makeBuffer(8);
    cache.resolved.set(url, original);
    cache.reversed.set(original, reversed);
    const banks = {
      kit: {
        samples: {
          bd: {
            "0": [{ type: "sprite" as const, src: url, start: 0.5, end: 0.75 }],
          },
        },
      },
    };

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          direction: "reverse",
          notes: staticPattern(12),
          region: {
            type: "static",
            start: staticParam(0.25),
            duration: staticParam(0.25),
          },
        }),
        banks,
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);

    expect(createdSources[0].buffer).toBe(reversed);
    expect(createdSources[0].playbackRate.value).toBe(2);
    expect(createdSources[0].start).toHaveBeenCalledWith(10, 3);
  });

  it("reverse duration loops map loop points onto the reversed buffer", async () => {
    const url = "https://example.com/loop.wav";
    const original = makeBuffer(4);
    const reversed = makeBuffer(4);
    cache.resolved.set(url, original);
    cache.reversed.set(original, reversed);

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          direction: "reverse",
          loop: true,
          notes: staticPattern(0),
          region: {
            type: "static",
            start: staticParam(0.25),
            duration: staticParam(0.1),
          },
        }),
        banks: makeBanks(url),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);

    expect(createdSources[0].loopStart).toBeCloseTo(2.6);
    expect(createdSources[0].loopEnd).toBeCloseTo(3);
  });

  it("alternate direction starts forward and toggles after emitted hits", async () => {
    const url = "https://example.com/loop.wav";
    const original = makeBuffer(4);
    const reversed = makeBuffer(4);
    cache.resolved.set(url, original);
    cache.reversed.set(original, reversed);

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          direction: "alternate",
          notes: staticPattern(0),
        }),
        banks: makeBanks(url),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);
    sampler.scheduleBar(1, 12);
    sampler.scheduleBar(2, 14);

    expect(createdSources.map((source) => source.buffer)).toEqual([
      original,
      reversed,
      original,
    ]);
  });

  it("alternate direction persists across empty bars", async () => {
    const url = "https://example.com/loop.wav";
    const original = makeBuffer(4);
    const reversed = makeBuffer(4);
    cache.resolved.set(url, original);
    cache.reversed.set(original, reversed);
    const notes: StaticSchema = {
      type: "static",
      polyphonic: false,
      cycle: [
        [{ value: 0, offset: 0, duration: 1, stepIndex: 0 }],
        [],
        [{ value: 0, offset: 0, duration: 1, stepIndex: 0 }],
      ],
    };

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({ direction: "alternate", notes }),
        banks: makeBanks(url),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);
    sampler.scheduleBar(1, 12);
    sampler.scheduleBar(2, 14);

    expect(createdSources.map((source) => source.buffer)).toEqual([
      original,
      reversed,
    ]);
  });

  it("zero-duration hits do not advance alternate direction", async () => {
    const url = "https://example.com/loop.wav";
    const original = makeBuffer(4);
    const reversed = makeBuffer(4);
    cache.resolved.set(url, original);
    cache.reversed.set(original, reversed);

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          direction: "alternate",
          notes: staticCycle([0, 0]),
          region: {
            type: "static",
            start: staticParam(0),
            duration: staticCycle([0, 0.25]),
          },
        }),
        banks: makeBanks(url),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);

    expect(createdSources).toHaveLength(1);
    expect(createdSources[0].buffer).toBe(original);
  });

  it("unavailable reverse buffers do not advance alternate direction", async () => {
    const url = "https://example.com/loop.wav";
    const original = makeBuffer(4);
    const reversed = makeBuffer(4);
    cache.resolved.set(url, original);
    cache.reversed.set(original, reversed);

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          direction: "alternate",
          notes: staticPattern(0),
        }),
        banks: makeBanks(url),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);
    cache.reversed.delete(original);
    sampler.scheduleBar(1, 12);
    cache.reversed.set(original, reversed);
    sampler.scheduleBar(2, 14);

    expect(createdSources.map((source) => source.buffer)).toEqual([
      original,
      reversed,
    ]);
  });

  it("cancelFutureNotes() resets alternate direction without changing its lifecycle", async () => {
    const url = "https://example.com/loop.wav";
    const original = makeBuffer(4);
    const reversed = makeBuffer(4);
    cache.resolved.set(url, original);
    cache.reversed.set(original, reversed);

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          direction: "alternate",
          notes: staticPattern(0),
        }),
        banks: makeBanks(url),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);
    sampler.scheduleBar(1, 12);
    sampler.cancelFutureNotes();
    sampler.scheduleBar(2, 14);

    expect(createdSources.map((source) => source.buffer)).toEqual([
      original,
      reversed,
      original,
    ]);
    expect(createdSources[0].stop).toHaveBeenCalledWith(0);
    expect(createdSources[1].stop).toHaveBeenCalledWith(0);
  });

  it("relative duration selects a source window from the resolved start", async () => {
    const url = "https://example.com/loop.wav";
    cache.resolved.set(url, makeBuffer(2));

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          notes: staticPattern(0, 0, 1),
          region: {
            type: "static",
            start: staticParam(0.4),
            duration: staticParam(0.15),
          },
        }),
        banks: makeBanks(url),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);

    expect(createdSources).toHaveLength(1);
    expect(createdSources[0].start).toHaveBeenCalledWith(10, 0.8);
    expect(createdSources[0].stop).toHaveBeenCalledWith(10.3025 + 0.05);
  });

  it("relative duration clamps at the end without moving start", async () => {
    const url = "https://example.com/loop.wav";
    cache.resolved.set(url, makeBuffer(2));

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          notes: staticPattern(0, 0, 1),
          region: {
            type: "static",
            start: staticParam(0.8),
            duration: staticParam(0.3),
          },
        }),
        banks: makeBanks(url),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);

    expect(createdSources).toHaveLength(1);
    expect(createdSources[0].start).toHaveBeenCalledWith(10, 1.6);
    expect(createdSources[0].stop).toHaveBeenCalledWith(10.4025 + 0.05);
  });

  it("zero relative duration skips voice creation", async () => {
    const url = "https://example.com/loop.wav";
    cache.resolved.set(url, makeBuffer(2));

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          region: {
            type: "static",
            start: staticParam(0.4),
            duration: staticParam(0),
          },
        }),
        banks: makeBanks(url),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);

    expect(createdSources).toHaveLength(0);
  });

  it("relative duration maps within sprite entries", async () => {
    const url = "https://example.com/kit.wav";
    cache.resolved.set(url, makeBuffer(4));
    const banks = {
      kit: {
        samples: {
          bd: {
            "0": [
              { type: "sprite" as const, src: url, start: 0.25, end: 0.75 },
            ],
          },
        },
      },
    };
    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          region: {
            type: "static",
            start: staticParam(0.5),
            duration: staticParam(0.25),
          },
        }),
        banks,
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);

    expect(createdSources).toHaveLength(1);
    expect(createdSources[0].start).toHaveBeenCalledWith(10, 2);
    expect(createdSources[0].stop.mock.calls[0][0]).toBeCloseTo(
      10 + 0.5 / Math.pow(2, 1 / 12) + 0.0025 + 0.05,
    );
  });

  it("relative duration uses original grid indices across mask gaps", async () => {
    // Phase 5 intentionally changes the second duration lookup from grid index
    // 2 (0.03) to hit index 1 (0.02), while preserving both start times.
    const url = "https://example.com/loop.wav";
    cache.resolved.set(url, makeBuffer(10));
    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          mask: {
            type: "static",
            polyphonic: false,
            cycle: [
              [
                { value: 1, offset: 0, duration: 0.25, stepIndex: 0 },
                { value: 1, offset: 0.5, duration: 0.25, stepIndex: 2 },
              ],
            ],
          },
          region: {
            type: "static",
            start: staticParam(0),
            duration: staticCycle([0.01, 0.02, 0.03]),
          },
        }),
        banks: makeBanks(url),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);

    expect(createdSources).toHaveLength(2);
    expect(createdSources[0].stop.mock.calls[0][0]).toBeCloseTo(
      10 + 0.1 / Math.pow(2, 1 / 12) + 0.0025 + 0.05,
    );
    expect(createdSources[1].stop.mock.calls[0][0]).toBeCloseTo(
      11 + 0.3 / Math.pow(2, 1 / 12) + 0.0025 + 0.05,
    );
  });

  it("looping relative-duration regions set the source loop window", async () => {
    const url = "https://example.com/loop.wav";
    cache.resolved.set(url, makeBuffer(2));
    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          loop: true,
          region: {
            type: "static",
            start: staticParam(0.4),
            duration: staticParam(0.15),
          },
        }),
        banks: makeBanks(url),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);

    expect(createdSources[0].loopStart).toBeCloseTo(0.8);
    expect(createdSources[0].loopEnd).toBeCloseTo(1.1);
    const stepEndTime = 10 + clock.barDuration;
    expect(createdGains[0].gain.setValueAtTime).toHaveBeenNthCalledWith(
      2,
      1,
      stepEndTime,
    );
    expect(createdSources[0].stop).toHaveBeenCalledWith(
      stepEndTime + 0.0025 + 0.05,
    );
  });

  it("one-shot static file regions play the selected source duration", async () => {
    const url = "https://example.com/loop.wav";
    cache.resolved.set(url, makeBuffer(4));

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          notes: staticPattern(0, 0, 0.25),
          clipMode: "one-shot",
          region: {
            type: "static",
            start: staticParam(0.25),
            end: staticParam(0.75),
          },
        }),
        banks: makeBanks(url),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);

    expect(createdSources[0].start).toHaveBeenCalledWith(10, 1);
    expect(createdSources[0].stop).toHaveBeenCalledWith(12.0025 + 0.05);
  });

  it("chop regions schedule selected file slices", async () => {
    const url = "https://example.com/break.wav";
    cache.resolved.set(url, makeBuffer(4));

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          notes: staticCycle([0, 0, 0, 0]),
          region: {
            type: "chop",
            slices: [
              { start: 0, end: 0.25 },
              { start: 0.25, end: 0.5 },
              { start: 0.5, end: 0.75 },
              { start: 0.75, end: 1 },
            ],
            sequence: staticCycle([0, 2, 1, 3]),
          },
        }),
        banks: makeBanks(url),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);

    expect(createdSources).toHaveLength(4);
    expect(createdSources[0].start).toHaveBeenCalledWith(10, 0);
    expect(createdSources[1].start).toHaveBeenCalledWith(10.5, 2);
    expect(createdSources[2].start).toHaveBeenCalledWith(11, 1);
    expect(createdSources[3].start).toHaveBeenCalledWith(11.5, 3);
  });

  it("pitched sprite chooses source key before mapping chop slice", async () => {
    const url = "https://example.com/piano-sprite.wav";
    const buffer = makeBuffer(8);
    cache.resolved.set(url, buffer);
    const banks = {
      kit: {
        samples: {
          piano: {
            "45": [{ type: "sprite" as const, src: url, start: 0, end: 0.25 }],
            "57": [
              { type: "sprite" as const, src: url, start: 0.5, end: 0.75 },
            ],
          },
        },
      },
    };

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          sample: "piano",
          sourceKeys: [45, 57],
          notes: staticPattern(60),
          region: {
            type: "chop",
            slices: [
              { start: 0, end: 0.5 },
              { start: 0.5, end: 1 },
            ],
            sequence: staticParam(1),
          },
        }),
        banks,
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);

    expect(createdSources).toHaveLength(1);
    expect(createdSources[0].buffer).toBe(buffer);
    expect(createdSources[0].playbackRate.value).toBeCloseTo(
      Math.pow(2, 3 / 12),
    );
    expect(createdSources[0].start).toHaveBeenCalledWith(10, 5);
  });

  it("variation selection happens before chop mapping", async () => {
    const url = "https://example.com/kit.wav";
    cache.resolved.set(url, makeBuffer(8));
    const banks = {
      kit: {
        samples: {
          bd: {
            "0": [
              { type: "sprite" as const, src: url, start: 0, end: 0.25 },
              { type: "sprite" as const, src: url, start: 0.5, end: 0.75 },
            ],
          },
        },
      },
    };

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          variation: staticParam(1),
          region: {
            type: "chop",
            slices: [
              { start: 0, end: 0.5 },
              { start: 0.5, end: 1 },
            ],
            sequence: staticParam(1),
          },
        }),
        banks,
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);

    expect(createdSources).toHaveLength(1);
    expect(createdSources[0].start).toHaveBeenCalledWith(10, 5);
  });

  it("multisample source key selection composes with bounded chop", async () => {
    const urls = ["https://example.com/a2.wav", "https://example.com/a3.wav"];
    const buffers = [makeBuffer(4), makeBuffer(8)];
    urls.forEach((url, i) => cache.resolved.set(url, buffers[i]));
    const banks = {
      kit: {
        samples: {
          piano: {
            "45": [{ type: "file" as const, src: urls[0] }],
            "57": [{ type: "file" as const, src: urls[1] }],
          },
        },
      },
    };

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          sample: "piano",
          sourceKeys: [45, 57],
          notes: staticPattern(60),
          region: {
            type: "chop",
            slices: [
              { start: 0.25, end: 0.375 },
              { start: 0.375, end: 0.5 },
            ],
            sequence: staticParam(1),
          },
        }),
        banks,
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);

    expect(createdSources).toHaveLength(1);
    expect(createdSources[0].buffer).toBe(buffers[1]);
    expect(createdSources[0].start).toHaveBeenCalledWith(10, 3);
  });

  it("one-shot chop plays selected slice duration", async () => {
    const url = "https://example.com/break.wav";
    cache.resolved.set(url, makeBuffer(4));

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          notes: staticPattern(0, 0, 0.25),
          clipMode: "one-shot",
          region: {
            type: "chop",
            slices: [
              { start: 0, end: 0.25 },
              { start: 0.25, end: 0.5 },
              { start: 0.5, end: 0.75 },
              { start: 0.75, end: 1 },
            ],
            sequence: staticParam(2),
          },
        }),
        banks: makeBanks(url),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);

    expect(createdSources).toHaveLength(1);
    expect(createdSources[0].start).toHaveBeenCalledWith(10, 2);
    expect(createdSources[0].stop).toHaveBeenCalledWith(11.0025 + 0.05);
  });

  it("fit with bounded chop computes fit rate from the bounded chop window", async () => {
    const url = "https://example.com/break.wav";
    cache.resolved.set(url, makeBuffer(4));

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          fit: { type: "fit", bars: 1 },
          notes: staticCycle([0, 0, 0, 0]),
          region: {
            type: "chop",
            slices: [
              { start: 0.25, end: 0.375 },
              { start: 0.375, end: 0.5 },
              { start: 0.5, end: 0.625 },
              { start: 0.625, end: 0.75 },
            ],
            sequence: staticCycle([0, 1, 2, 3]),
          },
        }),
        banks: makeBanks(url),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);

    expect(createdSources).toHaveLength(4);
    expect(createdSources.map((source) => source.playbackRate.value)).toEqual([
      1, 1, 1, 1,
    ]);
    expect(createdSources[0].start).toHaveBeenCalledWith(10, 1);
    expect(createdSources[3].start).toHaveBeenCalledWith(11.5, 2.5);
  });

  it("bounded chop slices schedule correct file offsets", async () => {
    const url = "https://example.com/break.wav";
    cache.resolved.set(url, makeBuffer(4));

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          notes: staticCycle([0, 0, 0, 0]),
          region: {
            type: "chop",
            slices: [
              { start: 0.25, end: 0.375 },
              { start: 0.375, end: 0.5 },
              { start: 0.5, end: 0.625 },
              { start: 0.625, end: 0.75 },
            ],
            sequence: staticCycle([0, 1, 2, 3]),
          },
        }),
        banks: makeBanks(url),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);

    expect(createdSources).toHaveLength(4);
    expect(createdSources[0].start).toHaveBeenCalledWith(10, 1);
    expect(createdSources[1].start).toHaveBeenCalledWith(10.5, 1.5);
    expect(createdSources[2].start).toHaveBeenCalledWith(11, 2);
    expect(createdSources[3].start).toHaveBeenCalledWith(11.5, 2.5);
  });

  it("bounded chop slices compose with sprite entry windows", async () => {
    const url = "https://example.com/kit.wav";
    cache.resolved.set(url, makeBuffer(8));
    const banks = {
      kit: {
        samples: {
          bd: {
            "0": [
              { type: "sprite" as const, src: url, start: 0.25, end: 0.75 },
            ],
          },
        },
      },
    };

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          notes: staticCycle([0, 0]),
          region: {
            type: "chop",
            slices: [
              { start: 0.25, end: 0.5 },
              { start: 0.5, end: 0.75 },
            ],
            sequence: staticCycle([0, 1]),
          },
        }),
        banks,
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);

    expect(createdSources).toHaveLength(2);
    expect(createdSources[0].start).toHaveBeenCalledWith(10, 3);
    expect(createdSources[1].start).toHaveBeenCalledWith(11, 4);
  });

  it("chop indices wrap modulo slice count", async () => {
    const url = "https://example.com/break.wav";
    cache.resolved.set(url, makeBuffer(4));

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          notes: staticCycle([0, 0]),
          region: {
            type: "chop",
            slices: [
              { start: 0, end: 0.25 },
              { start: 0.25, end: 0.5 },
              { start: 0.5, end: 0.75 },
              { start: 0.75, end: 1 },
            ],
            sequence: staticCycle([-1, 4]),
          },
        }),
        banks: makeBanks(url),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);

    expect(createdSources).toHaveLength(2);
    expect(createdSources[0].start).toHaveBeenCalledWith(10, 3);
    expect(createdSources[1].start).toHaveBeenCalledWith(11, 0);
  });

  it("invalid resolved dynamic regions skip and warn", async () => {
    const url = "https://example.com/loop.wav";
    cache.resolved.set(url, makeBuffer(2));

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          region: {
            type: "static",
            start: staticParam(0.75),
            end: staticParam(0.25),
          },
        }),
        banks: makeBanks(url),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);

    expect(createdSources).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(
      "[Sampler] Skipping note with invalid region window start=0.75, end=0.25.",
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
    const sampleDuration = 3 / Math.pow(2, 2 / 12);
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

  describe("sparse-rhythm indexing characterization", () => {
    it("cycles static source notes across active random-mask positions", async () => {
      const url = "https://example.com/bd.wav";
      cache.resolved.set(url, makeBuffer(1));
      const sampler = new Sampler(
        ctx as unknown as AudioContext,
        clock as never,
        {
          schema: makeSchema({
            notes: staticCycle([0, 12]),
            mask: sparseRandomMask(),
          }),
          banks: makeBanks(url),
          cache,
        },
      );

      await sampler.load();
      sampler.scheduleBar(0, 8);

      expect(
        createdSources.map(({ playbackRate }) => playbackRate.value),
      ).toEqual([1, 2]);
      expect(createdSources.map(({ start }) => start.mock.calls[0][0])).toEqual(
        [8, 9],
      );
    });

    it.each([
      ["static", sparseMask()],
      ["random", sparseRandomMask()],
    ])(
      "resolves random notes at consecutive hit indices under a %s mask",
      async (_maskType, mask) => {
        const url = "https://example.com/bd.wav";
        cache.resolved.set(url, makeBuffer(1));
        const notes = randomValueCycle([0, 12, 24]);
        const resolver = new RandomResolver(notes);
        const sampler = new Sampler(
          ctx as unknown as AudioContext,
          clock as never,
          {
            schema: makeSchema({ notes, mask }),
            banks: makeBanks(url),
            cache,
          },
        );

        await sampler.load();
        sampler.scheduleBar(0, 8);

        expect(
          createdSources.map(({ playbackRate }) => playbackRate.value),
        ).toEqual([
          Math.pow(2, resolver.resolve(0, 0) / 12),
          Math.pow(2, resolver.resolve(0, 1) / 12),
        ]);
        expect(
          createdSources.map(({ start }) => start.mock.calls[0][0]),
        ).toEqual([8, 9]);
      },
    );

    it("preserves polyphonic source onsets under a mask", async () => {
      const url = "https://example.com/bd.wav";
      cache.resolved.set(url, makeBuffer(1));
      const notes: StaticSchema = {
        type: "static",
        polyphonic: true,
        cycle: [
          [
            { value: 0, offset: 0, duration: 0.5, stepIndex: 0 },
            { value: 12, offset: 0, duration: 0.5, stepIndex: 0 },
            { value: 24, offset: 0.5, duration: 0.5, stepIndex: 1 },
          ],
        ],
      };
      const sampler = new Sampler(
        ctx as unknown as AudioContext,
        clock as never,
        {
          schema: makeSchema({
            notes,
            mask: sparseMask(),
            detune: staticCycle([10, 20]),
          }),
          banks: makeBanks(url),
          cache,
        },
      );

      await sampler.load();
      sampler.scheduleBar(0, 8);

      expect(
        createdSources.map(({ playbackRate }) => playbackRate.value),
      ).toEqual([1, 2, 4]);
      expect(createdSources.map(({ detune }) => detune.value)).toEqual([
        10, 10, 20,
      ]);
      expect(createdSources.map(({ start }) => start.mock.calls[0][0])).toEqual(
        [8, 8, 9],
      );
    });

    it("uses sparse grid indices for variation before the hit-index migration", async () => {
      const urls = [
        "https://example.com/bd-0.wav",
        "https://example.com/bd-1.wav",
        "https://example.com/bd-2.wav",
      ];
      const buffers = urls.map(() => makeBuffer(1));
      urls.forEach((url, index) => cache.resolved.set(url, buffers[index]));
      const banks = makeBanks(urls[0]);
      banks.kit.samples.bd = {
        "0": urls.map((src) => ({ type: "file" as const, src })),
      };
      const sampler = new Sampler(
        ctx as unknown as AudioContext,
        clock as never,
        {
          schema: makeSchema({
            notes: staticCycle([0, 0]),
            mask: sparseMask(),
            variation: staticCycle([0, 1, 2]),
          }),
          banks,
          cache,
        },
      );

      await sampler.load();
      sampler.scheduleBar(0, 8);

      expect(createdSources.map(({ buffer }) => buffer)).toEqual([
        buffers[0],
        buffers[2],
      ]);
      expect(createdSources.map(({ start }) => start.mock.calls[0][0])).toEqual(
        [8, 9],
      );
    });

    it("uses sparse grid indices for static region boundaries", async () => {
      const url = "https://example.com/loop.wav";
      cache.resolved.set(url, makeBuffer(10));
      const sampler = new Sampler(
        ctx as unknown as AudioContext,
        clock as never,
        {
          schema: makeSchema({
            mask: sparseMask(),
            clipMode: "one-shot",
            region: {
              type: "static",
              start: staticCycle([0, 0.1, 0.2]),
              end: staticCycle([0.1, 0.4, 0.8]),
            },
          }),
          banks: makeBanks(url),
          cache,
        },
      );

      await sampler.load();
      sampler.scheduleBar(0, 8);

      expect(createdSources).toHaveLength(2);
      expect(createdSources[0].start).toHaveBeenCalledWith(8, 0);
      expect(createdSources[1].start).toHaveBeenCalledWith(9, 2);
    });

    it("uses sparse grid indices for chop sequence values", async () => {
      const url = "https://example.com/break.wav";
      cache.resolved.set(url, makeBuffer(4));
      const sampler = new Sampler(
        ctx as unknown as AudioContext,
        clock as never,
        {
          schema: makeSchema({
            notes: staticCycle([0, 0]),
            mask: sparseMask(),
            region: {
              type: "chop",
              slices: [
                { start: 0, end: 0.25 },
                { start: 0.25, end: 0.5 },
                { start: 0.5, end: 0.75 },
              ],
              sequence: staticCycle([0, 1, 2]),
            },
          }),
          banks: makeBanks(url),
          cache,
        },
      );

      await sampler.load();
      sampler.scheduleBar(0, 8);

      expect(createdSources).toHaveLength(2);
      expect(createdSources[0].start).toHaveBeenCalledWith(8, 0);
      expect(createdSources[1].start).toHaveBeenCalledWith(9, 2);
    });
  });

  it("cycles source notes across active static mask positions", async () => {
    const url = "https://example.com/bd.wav";
    cache.resolved.set(url, makeBuffer(1));

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          notes: staticCycle([0, 12]),
          mask: {
            type: "static",
            polyphonic: false,
            cycle: [
              [
                { value: 1, offset: 0, duration: 0.25, stepIndex: 0 },
                { value: 1, offset: 0.5, duration: 0.25, stepIndex: 2 },
                { value: 1, offset: 0.75, duration: 0.25, stepIndex: 3 },
              ],
            ],
          },
        }),
        banks: makeBanks(url),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 8);

    expect(createdSources).toHaveLength(3);
    expect(createdSources.map((source) => source.playbackRate.value)).toEqual([
      1, 2, 1,
    ]);
    expect(
      createdSources.map((source) => source.start.mock.calls[0][0]),
    ).toEqual([8, 9, 9.5]);
  });

  it("suppresses sampler voices for dynamic mask misses", async () => {
    const url = "https://example.com/bd.wav";
    cache.resolved.set(url, makeBuffer(1));

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          mask: {
            type: "random",
            dataType: "binary",
            chance: 0,
            segments: [{ seed: 42 }],
            quantValue: undefined,
            range: undefined,
            algorithm: "xor",
            grid: {
              type: "static",
              polyphonic: false,
              cycle: [
                [
                  { value: 1, offset: 0, duration: 0.5, stepIndex: 0 },
                  { value: 1, offset: 0.5, duration: 0.5, stepIndex: 1 },
                ],
              ],
            },
          },
        }),
        banks: makeBanks(url),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 8);

    expect(createdSources).toHaveLength(0);
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
    expect([Math.pow(2, 0.5 / 12), Math.pow(2, 1.5 / 12)]).toContain(
      createdSources[0].playbackRate.value,
    );
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
    expect(createdSources[0].playbackRate.value).toBeCloseTo(
      Math.pow(2, 1 / 12),
    );
    expect(createdSources[0].start).toHaveBeenCalledWith(4);
    expect(createdSources[1].playbackRate.value).toBeCloseTo(
      Math.pow(2, 2 / 12),
    );
    expect(createdSources[1].start).toHaveBeenCalledWith(5);
  });

  it("random notes affect nearest source key selection and playbackRate", async () => {
    const urls = [
      "https://example.com/root.wav",
      "https://example.com/octave.wav",
    ];
    const buffers = [makeBuffer(1), makeBuffer(1.1)];
    cache.resolved.set(urls[0], buffers[0]);
    cache.resolved.set(urls[1], buffers[1]);
    const banks = {
      kit: {
        samples: {
          piano: {
            "0": [{ type: "file" as const, src: urls[0] }],
            "12": [{ type: "file" as const, src: urls[1] }],
          },
        },
      },
    };

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          sample: "piano",
          sourceKeys: [0, 12],
          notes: randomSchema([0, 14]),
        }),
        banks,
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 4);

    expect(createdSources).toHaveLength(1);
    if (createdSources[0].buffer === buffers[0]) {
      expect(createdSources[0].playbackRate.value).toBe(1);
    } else {
      expect(createdSources[0].buffer).toBe(buffers[1]);
      expect(createdSources[0].playbackRate.value).toBeCloseTo(
        Math.pow(2, 2 / 12),
      );
    }
  });

  it("random variation affects selected variation entry independently", async () => {
    const urls = [
      "https://example.com/bd-0.wav",
      "https://example.com/bd-1.wav",
    ];
    const buffers = [makeBuffer(1), makeBuffer(1.1)];
    cache.resolved.set(urls[0], buffers[0]);
    cache.resolved.set(urls[1], buffers[1]);
    const banks = {
      kit: {
        samples: {
          bd: {
            "0": urls.map((src) => ({ type: "file" as const, src })),
          },
        },
      },
    };

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          notes: staticPattern(0),
          variation: randomSchema([0, 1]),
        }),
        banks,
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 4);

    expect(createdSources).toHaveLength(1);
    expect(buffers).toContain(createdSources[0].buffer);
    expect(createdSources[0].playbackRate.value).toBe(1);
  });

  it("random notes and random variation compose without schema changes", async () => {
    const urls = [
      "https://example.com/root-0.wav",
      "https://example.com/root-1.wav",
      "https://example.com/octave-0.wav",
      "https://example.com/octave-1.wav",
    ];
    const buffers = urls.map((_, i) => makeBuffer(1 + i / 10));
    urls.forEach((url, i) => cache.resolved.set(url, buffers[i]));
    const banks = {
      kit: {
        samples: {
          piano: {
            "0": urls
              .slice(0, 2)
              .map((src) => ({ type: "file" as const, src })),
            "12": urls.slice(2).map((src) => ({ type: "file" as const, src })),
          },
        },
      },
    };

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          sample: "piano",
          sourceKeys: [0, 12],
          notes: randomSchema([0, 14]),
          variation: randomSchema([0, 1]),
        }),
        banks,
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 4);

    expect(createdSources).toHaveLength(1);
    expect(buffers).toContain(createdSources[0].buffer);
    expect([1, Math.pow(2, 2 / 12)]).toContain(
      createdSources[0].playbackRate.value,
    );
  });

  it("selects the nearest source key and computes playbackRate", async () => {
    const urls = ["https://example.com/a2.wav", "https://example.com/a3.wav"];
    const buffers = [makeBuffer(1), makeBuffer(1.1)];
    cache.resolved.set(urls[0], buffers[0]);
    cache.resolved.set(urls[1], buffers[1]);
    const banks = {
      kit: {
        samples: {
          piano: {
            "45": [{ type: "file" as const, src: urls[0] }],
            "57": [{ type: "file" as const, src: urls[1] }],
          },
        },
      },
    };

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          sample: "piano",
          sourceKeys: [45, 57],
          notes: staticPattern(60),
        }),
        banks,
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 4);

    expect(createdSources).toHaveLength(1);
    expect(createdSources[0].buffer).toBe(buffers[1]);
    expect(createdSources[0].playbackRate.value).toBeCloseTo(
      Math.pow(2, 3 / 12),
    );
  });

  it("selects nearest pitched sprite region and computes playbackRate", async () => {
    const url = "https://example.com/piano-sprite.wav";
    const buffer = makeBuffer(4);
    cache.resolved.set(url, buffer);
    const banks = {
      kit: {
        samples: {
          piano: {
            "45": [{ type: "sprite" as const, src: url, start: 0, end: 0.25 }],
            "57": [
              { type: "sprite" as const, src: url, start: 0.5, end: 0.75 },
            ],
          },
        },
      },
    };

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          sample: "piano",
          sourceKeys: [45, 57],
          notes: staticPattern(60),
        }),
        banks,
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 4);

    expect(createdSources).toHaveLength(1);
    expect(createdSources[0].buffer).toBe(buffer);
    expect(createdSources[0].playbackRate.value).toBeCloseTo(
      Math.pow(2, 3 / 12),
    );
    expect(createdSources[0].start).toHaveBeenCalledWith(4, 2);
  });

  it("schedules sprite entries with offset and region duration", async () => {
    const url = "https://example.com/kit.wav";
    const buffer = makeBuffer(4);
    cache.resolved.set(url, buffer);
    const banks = {
      kit: {
        samples: {
          bd: {
            "0": [{ type: "sprite" as const, src: url, start: 0.5, end: 0.75 }],
          },
        },
      },
    };

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({ notes: staticPattern(0, 0, 1) }),
        banks,
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 4);

    expect(createdSources).toHaveLength(1);
    expect(createdSources[0].start).toHaveBeenCalledWith(4, 2);
    expect(createdSources[0].stop).toHaveBeenCalledWith(5.0025 + 0.05);
  });

  it("accounts for playbackRate when scheduling sprite duration", async () => {
    const url = "https://example.com/kit.wav";
    cache.resolved.set(url, makeBuffer(4));
    const banks = {
      kit: {
        samples: {
          bd: {
            "0": [{ type: "sprite" as const, src: url, start: 0, end: 0.5 }],
          },
        },
      },
    };

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({ notes: staticPattern(12, 0, 1) }),
        banks,
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 4);

    expect(createdSources[0].playbackRate.value).toBe(2);
    expect(createdSources[0].start).toHaveBeenCalledWith(4, 0);
    expect(createdSources[0].stop).toHaveBeenCalledWith(5.0025 + 0.05);
  });

  it("sprite variations sharing the same src fetch once", async () => {
    const url = "https://example.com/kit.wav";
    ctx.decodedBuffers.push(makeBuffer(4));
    globalThis.fetch = vi.fn(async () => ({
      arrayBuffer: async () => new ArrayBuffer(8),
    })) as unknown as typeof fetch;
    const banks = {
      kit: {
        samples: {
          bd: {
            "0": [
              { type: "sprite" as const, src: url, start: 0, end: 0.25 },
              { type: "sprite" as const, src: url, start: 0.5, end: 0.75 },
            ],
          },
        },
      },
    };

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({ variation: staticCycle([0, 1]) }),
        banks,
        cache,
      },
    );

    await sampler.load();

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(url);
  });

  it("static regions compose with sprite entry windows", async () => {
    const url = "https://example.com/kit.wav";
    cache.resolved.set(url, makeBuffer(4));
    const banks = {
      kit: {
        samples: {
          bd: {
            "0": [{ type: "sprite" as const, src: url, start: 0.25, end: 0.5 }],
          },
        },
      },
    };

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          notes: staticPattern(0),
          region: {
            type: "static",
            start: staticParam(0.5),
            end: staticParam(1),
          },
        }),
        banks,
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 4);

    expect(createdSources).toHaveLength(1);
    expect(createdSources[0].start).toHaveBeenCalledWith(4, 1.5);
    expect(createdSources[0].stop).toHaveBeenCalledWith(4.5025 + 0.05);
  });

  it("resolves variation before applying static regions", async () => {
    const url = "https://example.com/kit.wav";
    cache.resolved.set(url, makeBuffer(4));
    const banks = {
      kit: {
        samples: {
          bd: {
            "0": [
              { type: "sprite" as const, src: url, start: 0, end: 0.25 },
              { type: "sprite" as const, src: url, start: 0.5, end: 0.75 },
            ],
          },
        },
      },
    };

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          variation: staticParam(1),
          region: {
            type: "static",
            start: staticParam(0.5),
            end: staticParam(1),
          },
        }),
        banks,
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 4);

    expect(createdSources).toHaveLength(1);
    expect(createdSources[0].start).toHaveBeenCalledWith(4, 2.5);
  });

  it("resolves source key before applying static regions to pitched sprites", async () => {
    const url = "https://example.com/piano-sprite.wav";
    const buffer = makeBuffer(4);
    cache.resolved.set(url, buffer);
    const banks = {
      kit: {
        samples: {
          piano: {
            "45": [{ type: "sprite" as const, src: url, start: 0, end: 0.25 }],
            "57": [
              { type: "sprite" as const, src: url, start: 0.5, end: 0.75 },
            ],
          },
        },
      },
    };

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          sample: "piano",
          sourceKeys: [45, 57],
          notes: staticPattern(60),
          region: {
            type: "static",
            start: staticParam(0.5),
            end: staticParam(1),
          },
        }),
        banks,
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 4);

    expect(createdSources).toHaveLength(1);
    expect(createdSources[0].buffer).toBe(buffer);
    expect(createdSources[0].playbackRate.value).toBeCloseTo(
      Math.pow(2, 3 / 12),
    );
    expect(createdSources[0].start).toHaveBeenCalledWith(4, 2.5);
  });

  it("resolves source key before applying static regions to multisamples", async () => {
    const urls = ["https://example.com/a2.wav", "https://example.com/a3.wav"];
    const buffers = [makeBuffer(2), makeBuffer(4)];
    urls.forEach((url, i) => cache.resolved.set(url, buffers[i]));
    const banks = {
      kit: {
        samples: {
          piano: {
            "45": [{ type: "file" as const, src: urls[0] }],
            "57": [{ type: "file" as const, src: urls[1] }],
          },
        },
      },
    };

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          sample: "piano",
          sourceKeys: [45, 57],
          notes: staticPattern(60),
          region: {
            type: "static",
            start: staticParam(0.25),
            end: staticParam(0.75),
          },
        }),
        banks,
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 4);

    expect(createdSources).toHaveLength(1);
    expect(createdSources[0].buffer).toBe(buffers[1]);
    expect(createdSources[0].start).toHaveBeenCalledWith(4, 1);
  });

  it("sprite variations select different regions from the same file", async () => {
    const url = "https://example.com/kit.wav";
    cache.resolved.set(url, makeBuffer(4));
    const banks = {
      kit: {
        samples: {
          bd: {
            "0": [
              { type: "sprite" as const, src: url, start: 0, end: 0.25 },
              { type: "sprite" as const, src: url, start: 0.5, end: 0.75 },
            ],
          },
        },
      },
    };

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
    sampler.scheduleBar(0, 4);

    expect(createdSources).toHaveLength(1);
    expect(createdSources[0].start).toHaveBeenCalledWith(4, 2);
  });

  it("falls back to variation 0 when selected variation is out of range", async () => {
    const url = "https://example.com/a2.wav";
    const buffer = makeBuffer(1);
    cache.resolved.set(url, buffer);

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          sourceKeys: [45],
          notes: staticPattern(45),
          variation: staticParam(99),
        }),
        banks: {
          kit: {
            samples: {
              bd: { "45": [{ type: "file" as const, src: url }] },
            },
          },
        },
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 4);

    expect(createdSources).toHaveLength(1);
    expect(createdSources[0].buffer).toBe(buffer);
    expect(createdSources[0].playbackRate.value).toBe(1);
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
          notes: staticPattern(0),
          fit: { type: "fit", bars: 1 },
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
    expect(source.stop).toHaveBeenCalledWith(14.0525);
  });

  it("fit() uses sprite region duration instead of full buffer duration", async () => {
    const url = "https://example.com/loop-sprite.wav";
    cache.resolved.set(url, makeBuffer(4));
    const banks = {
      kit: {
        samples: {
          bd: {
            "0": [
              { type: "sprite" as const, src: url, start: 0.25, end: 0.75 },
            ],
          },
        },
      },
    };

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          notes: staticPattern(0),
          fit: { type: "fit", bars: 2 },
        }),
        banks,
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 12);

    expect(createdSources).toHaveLength(1);
    expect(createdSources[0].playbackRate.value).toBeCloseTo(0.5);
    expect(createdSources[0].start).toHaveBeenCalledWith(12, 1);
    expect(createdSources[0].stop).toHaveBeenCalledWith(14.0525);
  });

  it("fit() selects the requested variation", async () => {
    const urls = [
      "https://example.com/loop-0.wav",
      "https://example.com/loop-1.wav",
    ];
    const buffers = [makeBuffer(2), makeBuffer(4)];
    urls.forEach((url, i) => cache.resolved.set(url, buffers[i]));
    const banks = {
      kit: {
        samples: {
          bd: {
            "0": urls.map((src) => ({ type: "file" as const, src })),
          },
        },
      },
    };

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          notes: staticPattern(0),
          fit: { type: "fit", bars: 1 },
          variation: staticParam(1),
        }),
        banks,
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 12);

    expect(createdSources).toHaveLength(1);
    expect(createdSources[0].buffer).toBe(buffers[1]);
    expect(createdSources[0].playbackRate.value).toBeCloseTo(2);
  });

  it("fit + chop sustains selected slices for authored pattern note durations", async () => {
    const url = "https://example.com/break.wav";
    cache.resolved.set(url, makeBuffer(8));

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          fit: { type: "fit", bars: 2 },
          notes: {
            type: "static",
            polyphonic: false,
            cycle: [
              [
                { value: 0, offset: 0, duration: 0.5, stepIndex: 0 },
                { value: 0, offset: 0.5, duration: 0.5, stepIndex: 1 },
              ],
            ],
          },
          region: {
            type: "chop",
            slices: [
              { start: 0, end: 0.125 },
              { start: 0.125, end: 0.25 },
              { start: 0.25, end: 0.375 },
              { start: 0.375, end: 0.5 },
              { start: 0.5, end: 0.625 },
              { start: 0.625, end: 0.75 },
              { start: 0.75, end: 0.875 },
              { start: 0.875, end: 1 },
            ],
            sequence: staticCycle([0, 1]),
          },
        }),
        banks: makeBanks(url),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);

    expect(createdSources).toHaveLength(2);
    expect(createdSources[0].playbackRate.value).toBe(2);
    expect(createdSources[0].start).toHaveBeenCalledWith(10, 0);
    expect(createdSources[0].stop).toHaveBeenCalledWith(11.0025 + 0.05);
    expect(createdSources[1].playbackRate.value).toBe(2);
    expect(createdSources[1].start).toHaveBeenCalledWith(11, 1);
    expect(createdSources[1].stop).toHaveBeenCalledWith(12.0025 + 0.05);
  });

  it("explicit notes transpose fitted chopped slices without changing slice selection", async () => {
    const url = "https://example.com/break.wav";
    cache.resolved.set(url, makeBuffer(8));

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          fit: { type: "fit", bars: 2 },
          notes: {
            type: "static",
            polyphonic: false,
            cycle: [
              [
                { value: 0, offset: 0, duration: 0.5, stepIndex: 0 },
                { value: 12, offset: 0.5, duration: 0.5, stepIndex: 1 },
              ],
            ],
          },
          region: {
            type: "chop",
            slices: [
              { start: 0, end: 0.125 },
              { start: 0.125, end: 0.25 },
              { start: 0.25, end: 0.375 },
              { start: 0.375, end: 0.5 },
              { start: 0.5, end: 0.625 },
              { start: 0.625, end: 0.75 },
              { start: 0.75, end: 0.875 },
              { start: 0.875, end: 1 },
            ],
            sequence: staticCycle([0, 3]),
          },
        }),
        banks: makeBanks(url),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);

    expect(createdSources).toHaveLength(2);
    expect(createdSources[0].playbackRate.value).toBe(2);
    expect(createdSources[0].start).toHaveBeenCalledWith(10, 0);
    expect(createdSources[0].stop).toHaveBeenCalledWith(11.0025 + 0.05);
    expect(createdSources[1].playbackRate.value).toBe(4);
    expect(createdSources[1].start).toHaveBeenCalledWith(11, 3);
    expect(createdSources[1].stop).toHaveBeenCalledWith(12.0025 + 0.05);
  });

  it("fit + chop schedules quarter-note authored pattern slices", async () => {
    const url = "https://example.com/break.wav";
    cache.resolved.set(url, makeBuffer(8));

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          fit: { type: "fit", bars: 2 },
          notes: {
            type: "static",
            polyphonic: false,
            cycle: [
              [
                { value: 0, offset: 0, duration: 0.5, stepIndex: 0 },
                { value: 0, offset: 0.5, duration: 0.5, stepIndex: 1 },
              ],
              [
                { value: 0, offset: 0, duration: 0.5, stepIndex: 2 },
                { value: 0, offset: 0.5, duration: 0.5, stepIndex: 3 },
              ],
            ],
          },
          region: {
            type: "chop",
            slices: [
              { start: 0, end: 0.25 },
              { start: 0.25, end: 0.5 },
              { start: 0.5, end: 0.75 },
              { start: 0.75, end: 1 },
            ],
            sequence: staticCycle([0, 1, 2, 3]),
          },
        }),
        banks: makeBanks(url),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);
    sampler.scheduleBar(1, 12);

    expect(createdSources).toHaveLength(4);
    expect(createdSources.map((source) => source.playbackRate.value)).toEqual([
      2, 2, 2, 2,
    ]);
    expect(createdSources[0].start).toHaveBeenCalledWith(10, 0);
    expect(createdSources[0].stop).toHaveBeenCalledWith(11.0025 + 0.05);
    expect(createdSources[1].start).toHaveBeenCalledWith(11, 2);
    expect(createdSources[1].stop).toHaveBeenCalledWith(12.0025 + 0.05);
    expect(createdSources[2].start).toHaveBeenCalledWith(12, 4);
    expect(createdSources[2].stop).toHaveBeenCalledWith(13.0025 + 0.05);
    expect(createdSources[3].start).toHaveBeenCalledWith(13, 6);
    expect(createdSources[3].stop).toHaveBeenCalledWith(14.0025 + 0.05);
  });

  it("fit-only generated chop regions use full source duration for fit rate", async () => {
    const url = "https://example.com/loop.wav";
    cache.resolved.set(url, makeBuffer(4));

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          fit: { type: "fit", bars: 2 },
          notes: {
            type: "static",
            polyphonic: false,
            cycle: [
              [{ value: 0, offset: 0, duration: 1, stepIndex: 0 }],
              [{ value: 0, offset: 0, duration: 1, stepIndex: 0 }],
            ],
          },
          region: {
            type: "chop",
            slices: [
              { start: 0, end: 0.5 },
              { start: 0.5, end: 1 },
            ],
            sequence: {
              type: "static",
              polyphonic: false,
              cycle: [
                [{ value: 0, offset: 0, duration: 1, stepIndex: 0 }],
                [{ value: 1, offset: 0, duration: 1, stepIndex: 0 }],
              ],
            },
          },
        }),
        banks: makeBanks(url),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(0, 10);
    sampler.scheduleBar(1, 12);

    expect(createdSources).toHaveLength(2);
    expect(createdSources[0].playbackRate.value).toBe(1);
    expect(createdSources[0].start).toHaveBeenCalledWith(10, 0);
    expect(createdSources[0].stop).toHaveBeenCalledWith(12.0025 + 0.05);
    expect(createdSources[1].playbackRate.value).toBe(1);
    expect(createdSources[1].start).toHaveBeenCalledWith(12, 2);
    expect(createdSources[1].stop).toHaveBeenCalledWith(14.0025 + 0.05);
  });

  it("fit() is applied through normal note scheduling on every triggered bar", async () => {
    const url = "https://example.com/loop.wav";
    cache.resolved.set(url, makeBuffer(2));

    const sampler = new Sampler(
      ctx as unknown as AudioContext,
      clock as never,
      {
        schema: makeSchema({
          notes: staticPattern(0),
          fit: { type: "fit", bars: 2 },
        }),
        banks: makeBanks(url),
        cache,
      },
    );

    await sampler.load();
    sampler.scheduleBar(1, 10);
    expect(createdSources).toHaveLength(1);
    expect(createdSources[0].start).toHaveBeenCalledWith(10);

    sampler.scheduleBar(2, 14);
    expect(createdSources).toHaveLength(2);
    expect(createdSources[1].start).toHaveBeenCalledWith(14);
  });

  it("finished resolves after a retired instrument's scheduled source ends", async () => {
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
    sampler.retire();

    let resolved = false;
    sampler.finished.then(() => {
      resolved = true;
    });

    expect(resolved).toBe(false);
    createdSources[0].fireEnded();
    await Promise.resolve();
    expect(resolved).toBe(true);
    expect(createdSources[0].disconnect).toHaveBeenCalled();
    expect(createdGains[0].disconnect).toHaveBeenCalled();
  });

  it("cancelFutureNotes() finishes retirement after stopping future notes", async () => {
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
    sampler.retire();
    sampler.cancelFutureNotes();

    let resolved = false;
    sampler.finished.then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(createdSources[0].stop).toHaveBeenCalledWith(0);
    expect(createdSources[0].disconnect).toHaveBeenCalled();
    expect(createdGains[0].disconnect).toHaveBeenCalled();
    expect(resolved).toBe(true);
  });
});
