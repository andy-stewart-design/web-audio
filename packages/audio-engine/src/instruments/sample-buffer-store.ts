import type { BankSchema } from "@web-audio/schema";
import { resolveSampleEntry } from "@/utils/resolve-sample-entry";

interface SampleCache {
  resolved: Map<string, AudioBuffer>;
  promises: Map<string, Promise<AudioBuffer | null>>;
}

interface SampleBufferStoreOptions {
  ctx: AudioContext;
  banks: Record<string, BankSchema>;
  cache: SampleCache;
  bank: string;
  sample: string;
  initialVariationIndex: number;
  fallbackBuffer?: AudioBuffer | null;
}

class SampleBufferStore {
  private _ctx: AudioContext;
  private _banks: Record<string, BankSchema>;
  private _cache: SampleCache;
  private _bank: string;
  private _sample: string;
  private _initialVariationIndex: number;
  private _fallbackBuffer: AudioBuffer | null;
  private _buffers = new Map<number, AudioBuffer>();

  constructor({
    ctx,
    banks,
    cache,
    bank,
    sample,
    initialVariationIndex,
    fallbackBuffer = null,
  }: SampleBufferStoreOptions) {
    this._ctx = ctx;
    this._banks = banks;
    this._cache = cache;
    this._bank = bank;
    this._sample = sample;
    this._initialVariationIndex = initialVariationIndex;
    this._fallbackBuffer = fallbackBuffer;
  }

  async preload(variationIndices: number[]): Promise<void> {
    await Promise.all(
      variationIndices.map((index) => this._loadVariation(index)),
    );
  }

  getPlaybackBuffer(
    variationIndex: number,
    barIndex: number,
  ): AudioBuffer | null {
    const buffer = this._buffers.get(variationIndex);
    if (buffer) return buffer;
    if (
      variationIndex === this._initialVariationIndex &&
      this._fallbackBuffer
    ) {
      return this._fallbackBuffer;
    }

    void this._loadVariation(variationIndex);
    console.warn(
      `[Sampler] "${this._bank}/${this._sample}" variation ${variationIndex} not yet loaded — skipping bar ${barIndex}`,
    );
    return null;
  }

  getInitialPlaybackBuffer(): AudioBuffer | null {
    return (
      this._buffers.get(this._initialVariationIndex) ?? this._fallbackBuffer
    );
  }

  hasInitialBuffer(): boolean {
    return this.getInitialPlaybackBuffer() !== null;
  }

  fallbackBufferFor(bank: string, sample: string): AudioBuffer | null {
    if (this._bank !== bank) return null;
    if (this._sample !== sample) return null;
    return this.getInitialPlaybackBuffer();
  }

  private async _loadVariation(variationIndex: number): Promise<void> {
    if (this._buffers.has(variationIndex)) return;

    const url = this._resolveUrl(variationIndex);
    if (!url) return;

    const resolved = this._cache.resolved.get(url);
    if (resolved) {
      this._buffers.set(variationIndex, resolved);
      return;
    }

    let promise = this._cache.promises.get(url);
    if (!promise) {
      promise = fetch(url)
        .then((r) => r.arrayBuffer())
        .then((b) => this._ctx.decodeAudioData(b))
        .catch(() => {
          console.warn(
            `[Sampler] Failed to load "${this._bank}/${this._sample}" from ${url}`,
          );
          this._cache.promises.delete(url);
          return null;
        });
      this._cache.promises.set(url, promise);
    }

    const buffer = await promise;
    if (buffer) {
      this._cache.resolved.set(url, buffer);
      this._buffers.set(variationIndex, buffer);
    }
  }

  private _resolveUrl(variationIndex: number): string | null {
    const entry = resolveSampleEntry({
      banks: this._banks,
      bank: this._bank,
      sample: this._sample,
      sourceKey: 0,
      variationIndex,
    });

    if (entry) return entry.src;

    if (!this._banks[this._bank]) {
      console.warn(`[Sampler] Bank "${this._bank}" not found in schema`);
    } else if (!this._banks[this._bank].samples[this._sample]) {
      console.warn(
        `[Sampler] Sample "${this._sample}" not found in bank "${this._bank}"`,
      );
    }

    return null;
  }
}

export default SampleBufferStore;
export type { SampleCache };
