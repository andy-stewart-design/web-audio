import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BankSchema } from "@web-audio/schema";
import SampleBufferStore from "./sample-buffer-store";

function makeBuffer(duration: number) {
  return { duration } as AudioBuffer;
}

function makeReversibleBuffer(values: number[]) {
  const data = new Float32Array(values);
  return {
    duration: values.length,
    numberOfChannels: 1,
    length: values.length,
    sampleRate: 44_100,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
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

describe("SampleBufferStore", () => {
  let ctx: AudioContext;
  let cache: {
    resolved: Map<string, AudioBuffer>;
    promises: Map<string, Promise<AudioBuffer | null>>;
    reversed: WeakMap<AudioBuffer, AudioBuffer>;
  };
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = { decodeAudioData: vi.fn() } as unknown as AudioContext;
    cache = {
      resolved: new Map(),
      promises: new Map(),
      reversed: new WeakMap(),
    };
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("resolves a cached buffer without fetching", async () => {
    const url = "https://example.com/bd.wav";
    const buffer = makeBuffer(1.25);
    cache.resolved.set(url, buffer);

    const store = new SampleBufferStore({
      ctx,
      banks: makeBanks(url),
      cache,
      bank: "kit",
      sample: "bd",
      initialVariationIndex: 0,
    });

    expect(store.hasInitialBuffer()).toBe(false);

    const preloadPromise = store.preload([0]);
    expect(store.hasInitialBuffer()).toBe(true);
    expect(store.getInitialPlaybackBuffer()).toBe(buffer);

    await preloadPromise;
    expect(store.getPlaybackBuffer(0, 0)).toBe(buffer);
  });

  it("fetches and decodes a buffer when not cached", async () => {
    const url = "https://example.com/bd.wav";
    const buffer = makeBuffer(1);
    ctx.decodeAudioData = vi.fn(async () => buffer);
    globalThis.fetch = vi.fn(async () => ({
      arrayBuffer: async () => new ArrayBuffer(8),
    })) as unknown as typeof fetch;

    const store = new SampleBufferStore({
      ctx,
      banks: makeBanks(url),
      cache,
      bank: "kit",
      sample: "bd",
      initialVariationIndex: 0,
    });

    await store.preload([0]);

    expect(globalThis.fetch).toHaveBeenCalledWith(url);
    expect(ctx.decodeAudioData).toHaveBeenCalledOnce();
    expect(store.hasInitialBuffer()).toBe(true);
    expect(store.getPlaybackBuffer(0, 0)).toBe(buffer);
  });

  it("reuses in-flight promises for the same URL", async () => {
    const url = "https://example.com/bd.wav";
    const buffer = makeBuffer(1);
    ctx.decodeAudioData = vi.fn(async () => buffer);
    globalThis.fetch = vi.fn(async () => ({
      arrayBuffer: async () => new ArrayBuffer(8),
    })) as unknown as typeof fetch;

    const storeA = new SampleBufferStore({
      ctx,
      banks: makeBanks(url),
      cache,
      bank: "kit",
      sample: "bd",
      initialVariationIndex: 0,
    });
    const storeB = new SampleBufferStore({
      ctx,
      banks: makeBanks(url),
      cache,
      bank: "kit",
      sample: "bd",
      initialVariationIndex: 0,
    });

    await Promise.all([storeA.preload([0]), storeB.preload([0])]);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(1);
    expect(storeA.getPlaybackBuffer(0, 0)).toBe(buffer);
    expect(storeB.getPlaybackBuffer(0, 0)).toBe(buffer);
  });

  it("warns and returns null when the bank is missing", async () => {
    const store = new SampleBufferStore({
      ctx,
      banks: makeBanks(),
      cache,
      bank: "missing",
      sample: "bd",
      initialVariationIndex: 0,
    });

    await store.preload([0]);

    expect(store.hasInitialBuffer()).toBe(false);
    expect(store.getPlaybackBuffer(0, 0)).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      '[Sampler] Bank "missing" not found in schema',
    );
  });

  it("warns and returns null when the sample is missing", async () => {
    const store = new SampleBufferStore({
      ctx,
      banks: makeBanks(),
      cache,
      bank: "kit",
      sample: "sn",
      initialVariationIndex: 0,
    });

    await store.preload([0]);

    expect(store.hasInitialBuffer()).toBe(false);
    expect(store.getPlaybackBuffer(0, 0)).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      '[Sampler] Sample "sn" not found in bank "kit"',
    );
  });

  it("uses fallback buffer as initial buffer when provided", () => {
    const fallback = makeBuffer(0.5);
    const store = new SampleBufferStore({
      ctx,
      banks: makeBanks(),
      cache,
      bank: "kit",
      sample: "bd",
      initialVariationIndex: 0,
      fallbackBuffer: fallback,
    });

    expect(store.hasInitialBuffer()).toBe(true);
    expect(store.getInitialPlaybackBuffer()).toBe(fallback);
    expect(store.getPlaybackBuffer(0, 0)).toBe(fallback);
  });

  it("returns fallback only for the initial variation index", () => {
    const fallback = makeBuffer(0.5);
    const store = new SampleBufferStore({
      ctx,
      banks: makeBanks(),
      cache,
      bank: "kit",
      sample: "bd",
      initialVariationIndex: 0,
      fallbackBuffer: fallback,
    });

    expect(store.getPlaybackBuffer(0, 0)).toBe(fallback);
    expect(store.getPlaybackBuffer(1, 0)).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      '[Sampler] "kit/bd" variation 1 not yet loaded — skipping bar 0',
    );
  });

  it("lazy-loads a missing variation and returns null initially", async () => {
    const url = "https://example.com/bd.wav";
    const buffer = makeBuffer(1);
    ctx.decodeAudioData = vi.fn(async () => buffer);
    globalThis.fetch = vi.fn(async () => ({
      arrayBuffer: async () => new ArrayBuffer(8),
    })) as unknown as typeof fetch;

    const store = new SampleBufferStore({
      ctx,
      banks: makeBanks(url),
      cache,
      bank: "kit",
      sample: "bd",
      initialVariationIndex: 0,
    });

    // Preload only variation 0
    await store.preload([0]);
    expect(store.getPlaybackBuffer(0, 0)).toBe(buffer);

    // Request variation 0 again — should still be available
    expect(store.getPlaybackBuffer(0, 1)).toBe(buffer);

    // Request variation 1 — not loaded, should return null and trigger async load
    const result = store.getPlaybackBuffer(1, 2);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      '[Sampler] "kit/bd" variation 1 not yet loaded — skipping bar 2',
    );

    // Wait for the async load to complete
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.getPlaybackBuffer(1, 3)).toBe(buffer);
  });

  it("warns on fetch failure and removes the promise from cache", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network failed");
    }) as unknown as typeof fetch;

    const store = new SampleBufferStore({
      ctx,
      banks: makeBanks(),
      cache,
      bank: "kit",
      sample: "bd",
      initialVariationIndex: 0,
    });

    await store.preload([0]);

    expect(store.hasInitialBuffer()).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load "kit/bd"'),
    );
    expect(cache.promises.size).toBe(0);
  });

  it("fallbackBufferFor returns the initial buffer for matching bank/sample", () => {
    const fallback = makeBuffer(0.5);
    const store = new SampleBufferStore({
      ctx,
      banks: makeBanks(),
      cache,
      bank: "kit",
      sample: "bd",
      initialVariationIndex: 0,
      fallbackBuffer: fallback,
    });

    expect(store.fallbackBufferFor("kit", "bd")).toBe(fallback);
    expect(store.fallbackBufferFor("other", "bd")).toBeNull();
    expect(store.fallbackBufferFor("kit", "sn")).toBeNull();
  });

  it("does not prepare reversed buffers for forward-only stores", async () => {
    const url = "https://example.com/bd.wav";
    const buffer = makeReversibleBuffer([1, 2, 3]);
    cache.resolved.set(url, buffer);
    ctx.createBuffer = vi.fn();

    const store = new SampleBufferStore({
      ctx,
      banks: makeBanks(url),
      cache,
      bank: "kit",
      sample: "bd",
      initialVariationIndex: 0,
    });

    await store.preload([0]);

    expect(ctx.createBuffer).not.toHaveBeenCalled();
    expect(cache.reversed.has(buffer)).toBe(false);
  });

  it("prepares cached buffers and returns their reversed variants", async () => {
    const url = "https://example.com/bd.wav";
    const original = makeReversibleBuffer([1, 2, 3]);
    const reversed = makeReversibleBuffer([0, 0, 0]);
    cache.resolved.set(url, original);
    ctx.createBuffer = vi.fn(() => reversed);

    const store = new SampleBufferStore({
      ctx,
      banks: makeBanks(url),
      cache,
      bank: "kit",
      sample: "bd",
      initialVariationIndex: 0,
      prepareReverse: true,
    });

    await store.preload([0]);

    expect(cache.reversed.get(original)).toBe(reversed);
    expect(store.getPlaybackSource(0, 0, 0, true)?.buffer).toBe(reversed);
    expect(Array.from(reversed.getChannelData(0))).toEqual([3, 2, 1]);
  });

  it("prepares newly decoded buffers before preload completes", async () => {
    const original = makeReversibleBuffer([1, 2, 3]);
    const reversed = makeReversibleBuffer([0, 0, 0]);
    ctx.decodeAudioData = vi.fn(async () => original);
    ctx.createBuffer = vi.fn(() => reversed);
    globalThis.fetch = vi.fn(async () => ({
      arrayBuffer: async () => new ArrayBuffer(8),
    })) as unknown as typeof fetch;

    const store = new SampleBufferStore({
      ctx,
      banks: makeBanks(),
      cache,
      bank: "kit",
      sample: "bd",
      initialVariationIndex: 0,
      prepareReverse: true,
    });

    await store.preload([0]);

    expect(cache.reversed.get(original)).toBe(reversed);
    expect(store.getPlaybackSource(0, 0, 0, true)?.buffer).toBe(reversed);
  });

  it("prepares fallback buffers immediately", () => {
    const fallback = makeReversibleBuffer([1, 2, 3]);
    const reversed = makeReversibleBuffer([0, 0, 0]);
    ctx.createBuffer = vi.fn(() => reversed);

    const store = new SampleBufferStore({
      ctx,
      banks: makeBanks(),
      cache,
      bank: "kit",
      sample: "bd",
      initialVariationIndex: 0,
      fallbackBuffer: fallback,
      prepareReverse: true,
    });

    expect(cache.reversed.get(fallback)).toBe(reversed);
    expect(store.getPlaybackSource(0, 0, 0, true)?.buffer).toBe(reversed);
  });

  it("prepares every preloaded variation and source key", async () => {
    const urls = [
      "https://example.com/45-0.wav",
      "https://example.com/45-1.wav",
      "https://example.com/57-0.wav",
      "https://example.com/57-1.wav",
    ];
    const originals = urls.map((_, index) =>
      makeReversibleBuffer([index, index + 1]),
    );
    urls.forEach((url, index) => cache.resolved.set(url, originals[index]));
    ctx.createBuffer = vi.fn(() => makeReversibleBuffer([0, 0]));
    const banks = {
      kit: {
        samples: {
          piano: {
            "45": urls
              .slice(0, 2)
              .map((src) => ({ type: "file" as const, src })),
            "57": urls.slice(2).map((src) => ({ type: "file" as const, src })),
          },
        },
      },
    };

    const store = new SampleBufferStore({
      ctx,
      banks,
      cache,
      bank: "kit",
      sample: "piano",
      initialVariationIndex: 0,
      initialSourceKey: 45,
      prepareReverse: true,
    });

    await store.preload([0, 1], [45, 57]);

    expect(ctx.createBuffer).toHaveBeenCalledTimes(4);
    originals.forEach((buffer) =>
      expect(cache.reversed.has(buffer)).toBe(true),
    );
  });

  it("warns when a requested reversed buffer was not prepared", async () => {
    const url = "https://example.com/bd.wav";
    cache.resolved.set(url, makeBuffer(1));
    const store = new SampleBufferStore({
      ctx,
      banks: makeBanks(url),
      cache,
      bank: "kit",
      sample: "bd",
      initialVariationIndex: 0,
    });

    await store.preload([0]);

    expect(store.getPlaybackSource(0, 3, 0, true)).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      '[Sampler] "kit/bd" reverse buffer is not prepared — skipping bar 3',
    );
  });

  it("falls back to variation 0 when the requested variation is out of range", async () => {
    const urls = ["https://example.com/bd-0.wav"];
    const buffer = makeBuffer(1);
    ctx.decodeAudioData = vi.fn(async () => buffer);
    globalThis.fetch = vi.fn(async () => ({
      arrayBuffer: async () => new ArrayBuffer(8),
    })) as unknown as typeof fetch;

    const store = new SampleBufferStore({
      ctx,
      banks: makeBanks(urls[0]),
      cache,
      bank: "kit",
      sample: "bd",
      initialVariationIndex: 99,
    });

    await store.preload([99]);

    expect(globalThis.fetch).toHaveBeenCalledWith(urls[0]);
    expect(store.getPlaybackBuffer(99, 0)).toBe(buffer);
  });
});
