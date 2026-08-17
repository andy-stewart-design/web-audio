import { describe, expect, it, vi } from "vitest";
import { getReversedBuffer } from "./reversed-buffer-cache";

function makeBuffer(channels: number[][]) {
  const data = channels.map((channel) => new Float32Array(channel));
  return {
    numberOfChannels: data.length,
    length: data[0].length,
    sampleRate: 44_100,
    getChannelData: (channel: number) => data[channel],
  } as unknown as AudioBuffer;
}

describe("getReversedBuffer", () => {
  it("reverses every channel without mutating the original", () => {
    const original = makeBuffer([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    const reversed = makeBuffer([
      [0, 0, 0],
      [0, 0, 0],
    ]);
    const ctx = {
      createBuffer: vi.fn(() => reversed),
    } as unknown as AudioContext;
    const cache = new WeakMap<AudioBuffer, AudioBuffer>();

    expect(getReversedBuffer(ctx, cache, original)).toBe(reversed);
    expect(Array.from(reversed.getChannelData(0))).toEqual([3, 2, 1]);
    expect(Array.from(reversed.getChannelData(1))).toEqual([6, 5, 4]);
    expect(Array.from(original.getChannelData(0))).toEqual([1, 2, 3]);
    expect(Array.from(original.getChannelData(1))).toEqual([4, 5, 6]);
  });

  it("reuses one reversed buffer per original", () => {
    const original = makeBuffer([[1, 2, 3]]);
    const reversed = makeBuffer([[0, 0, 0]]);
    const ctx = {
      createBuffer: vi.fn(() => reversed),
    } as unknown as AudioContext;
    const cache = new WeakMap<AudioBuffer, AudioBuffer>();

    expect(getReversedBuffer(ctx, cache, original)).toBe(reversed);
    expect(getReversedBuffer(ctx, cache, original)).toBe(reversed);
    expect(ctx.createBuffer).toHaveBeenCalledOnce();
  });

  it("does not share reversed buffers between originals", () => {
    const first = makeBuffer([[1, 2]]);
    const second = makeBuffer([[3, 4]]);
    const ctx = {
      createBuffer: vi.fn((channels: number, length: number) =>
        makeBuffer(
          Array.from({ length: channels }, () => Array(length).fill(0)),
        ),
      ),
    } as unknown as AudioContext;
    const cache = new WeakMap<AudioBuffer, AudioBuffer>();

    expect(getReversedBuffer(ctx, cache, first)).not.toBe(
      getReversedBuffer(ctx, cache, second),
    );
    expect(ctx.createBuffer).toHaveBeenCalledTimes(2);
  });
});
