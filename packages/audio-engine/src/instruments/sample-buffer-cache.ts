import { getReversedBuffer } from "@/utils/reversed-buffer-cache";

class SampleBufferCache {
  private readonly ctx: AudioContext;
  private readonly resolved = new Map<string, AudioBuffer>();
  private readonly loading = new Map<string, Promise<AudioBuffer | null>>();
  private readonly reversed = new WeakMap<AudioBuffer, AudioBuffer>();

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  get(url: string, reverse = false) {
    const buffer = this.resolved.get(url);
    if (!buffer) return null;
    if (!reverse) return buffer;
    return this.reversed.get(buffer) ?? null;
  }

  async prepare(url: string, prepareReverse = false) {
    const buffer = await this.load(url);
    if (buffer && prepareReverse) {
      getReversedBuffer(this.ctx, this.reversed, buffer);
    }
    return buffer;
  }

  private load(url: string) {
    const resolved = this.resolved.get(url);
    if (resolved) return Promise.resolve(resolved);

    const loading = this.loading.get(url);
    if (loading) return loading;

    const promise = fetch(url)
      .then((response) => response.arrayBuffer())
      .then((data) => this.ctx.decodeAudioData(data))
      .then((buffer) => {
        this.resolved.set(url, buffer);
        this.loading.delete(url);
        return buffer;
      })
      .catch(() => {
        console.warn(`[Sampler] Failed to load ${url}`);
        this.loading.delete(url);
        return null;
      });
    this.loading.set(url, promise);
    return promise;
  }
}

export default SampleBufferCache;
