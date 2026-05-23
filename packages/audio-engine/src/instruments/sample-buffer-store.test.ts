import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BankSchema } from "@web-audio/schema";
import SampleBufferStore from "./sample-buffer-store";

function makeBuffer(duration: number) {
  return { duration } as AudioBuffer;
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

describe("SampleBufferStore", () => {
  let ctx: AudioContext;
  let cache: {
    resolved: Map<string, AudioBuffer>;
    promises: Map<string, Promise<AudioBuffer | null>>;
  };
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = { decodeAudioData: vi.fn() } as unknown as AudioContext;
    cache = {
      resolved: new Map(),
      promises: new Map(),
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
