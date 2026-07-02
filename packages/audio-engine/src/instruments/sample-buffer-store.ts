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
  initialSourceKey?: number;
  fallbackBuffer?: AudioBuffer | null;
}

class SampleBufferStore {
  private _ctx: AudioContext;
  private _banks: Record<string, BankSchema>;
  private _cache: SampleCache;
  private _bank: string;
  private _sample: string;
  private _initialVariationIndex: number;
  private _initialSourceKey: number;
  private _fallbackBuffer: AudioBuffer | null;
  private _buffers = new Map<string, AudioBuffer>();

  constructor({
    ctx,
    banks,
    cache,
    bank,
    sample,
    initialVariationIndex,
    initialSourceKey = 0,
    fallbackBuffer = null,
  }: SampleBufferStoreOptions) {
    this._ctx = ctx;
    this._banks = banks;
    this._cache = cache;
    this._bank = bank;
    this._sample = sample;
    this._initialVariationIndex = initialVariationIndex;
    this._initialSourceKey = initialSourceKey;
    this._fallbackBuffer = fallbackBuffer;
  }

  async preload(variationIndices: number[], sourceKeys = [0]): Promise<void> {
    await Promise.all(
      sourceKeys.flatMap((sourceKey) =>
        variationIndices.map((index) => this._loadVariation(sourceKey, index)),
      ),
    );
  }

  getPlaybackBuffer(
    variationIndex: number,
    barIndex: number,
    sourceKey = 0,
  ): AudioBuffer | null {
    const cacheKey = this._cacheKey(sourceKey, variationIndex);
    const buffer = this._buffers.get(cacheKey);
    if (buffer) return buffer;
    if (
      sourceKey === this._initialSourceKey &&
      variationIndex === this._initialVariationIndex &&
      this._fallbackBuffer
    ) {
      return this._fallbackBuffer;
    }

    void this._loadVariation(sourceKey, variationIndex);
    console.warn(
      `[Sampler] "${this._bank}/${this._sample}" variation ${variationIndex} not yet loaded — skipping bar ${barIndex}`,
    );
    return null;
  }

  getInitialPlaybackBuffer(): AudioBuffer | null {
    return (
      this._buffers.get(
        this._cacheKey(this._initialSourceKey, this._initialVariationIndex),
      ) ??
      this._fallbackBuffer
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

  private _cacheKey(sourceKey: number, variationIndex: number) {
    return `${sourceKey}:${variationIndex}`;
  }

  private async _loadVariation(
    sourceKey: number,
    variationIndex: number,
  ): Promise<void> {
    const cacheKey = this._cacheKey(sourceKey, variationIndex);
    if (this._buffers.has(cacheKey)) return;

    const url = this._resolveUrl(sourceKey, variationIndex);
    if (!url) return;

    const resolved = this._cache.resolved.get(url);
    if (resolved) {
      this._buffers.set(cacheKey, resolved);
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
      this._buffers.set(cacheKey, buffer);
    }
  }

  private _resolveUrl(sourceKey: number, variationIndex: number): string | null {
    const entry = resolveSampleEntry({
      banks: this._banks,
      bank: this._bank,
      sample: this._sample,
      sourceKey,
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
