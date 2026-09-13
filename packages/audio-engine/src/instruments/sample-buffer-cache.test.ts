import { beforeEach, describe, expect, it, vi } from "vitest";
import SampleBufferCache from "./sample-buffer-cache";

function audioBuffer(values = [1, 2, 3]) {
  const data = Float32Array.from(values);
  return {
    numberOfChannels: 1,
    length: data.length,
    sampleRate: 48_000,
    duration: data.length / 48_000,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

function context() {
  return {
    decodeAudioData: vi.fn(async () => audioBuffer()),
    createBuffer: vi.fn((_channels, length, sampleRate) => {
      const data = new Float32Array(length);
      return {
        numberOfChannels: 1,
        length,
        sampleRate,
        duration: length / sampleRate,
        getChannelData: () => data,
      } as unknown as AudioBuffer;
    }),
  } as unknown as AudioContext;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("SampleBufferCache", () => {
  it("deduplicates concurrent fetch and decode by exact URL", async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const ctx = context();
    const cache = new SampleBufferCache(ctx);

    const first = cache.prepare("one.wav");
    const second = cache.prepare("one.wav");
    resolveFetch?.({ arrayBuffer: async () => new ArrayBuffer(8) } as Response);

    expect(await first).toBe(await second);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(ctx.decodeAudioData).toHaveBeenCalledOnce();
  });

  it("returns synchronous exact-URL hits after preparation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) })),
    );
    const cache = new SampleBufferCache(context());

    expect(cache.get("one.wav")).toBeNull();
    const prepared = await cache.prepare("one.wav");

    expect(cache.get("one.wav")).toBe(prepared);
    expect(cache.get("two.wav")).toBeNull();
  });

  it("keeps different URLs isolated", async () => {
    const ctx = context();
    vi.mocked(ctx.decodeAudioData)
      .mockResolvedValueOnce(audioBuffer([1]))
      .mockResolvedValueOnce(audioBuffer([2]));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) })),
    );
    const cache = new SampleBufferCache(ctx);

    await Promise.all([cache.prepare("one.wav"), cache.prepare("two.wav")]);

    expect(cache.get("one.wav")).not.toBe(cache.get("two.wav"));
  });

  it("removes failed loads so a later request can retry", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ arrayBuffer: async () => new ArrayBuffer(8) });
    vi.stubGlobal("fetch", fetchMock);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cache = new SampleBufferCache(context());

    expect(await cache.prepare("one.wav")).toBeNull();
    expect(await cache.prepare("one.wav")).not.toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith("[Sampler] Failed to load one.wav");
  });

  it("prepares and reuses a reversed buffer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) })),
    );
    const ctx = context();
    const cache = new SampleBufferCache(ctx);

    await cache.prepare("one.wav", true);
    const first = cache.get("one.wav", true);
    await cache.prepare("one.wav", true);

    expect(first).not.toBeNull();
    expect(cache.get("one.wav", true)).toBe(first);
    expect(ctx.createBuffer).toHaveBeenCalledOnce();
    expect(Array.from(first!.getChannelData(0))).toEqual([3, 2, 1]);
  });
});
