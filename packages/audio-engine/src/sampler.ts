import type AudioClock from "@web-audio/clock";
import type { BankSchema, SamplerSchema } from "@web-audio/schema";
import Instrument from "./instrument";

interface SamplerOptions {
  schema: SamplerSchema;
  banks: Record<string, BankSchema>;
  bufferCache: Map<string, Promise<AudioBuffer | null>>;
  startingBar?: number;
  barStartTime?: number;
}

class Sampler extends Instrument {
  private _schema: SamplerSchema;
  private _banks: Record<string, BankSchema>;
  private _bufferCache: Map<string, Promise<AudioBuffer | null>>;
  private _buffer: AudioBuffer | null = null;

  constructor(
    ctx: AudioContext,
    clock: AudioClock,
    { schema, banks, bufferCache, startingBar = 0, barStartTime }: SamplerOptions,
  ) {
    super(ctx, clock);
    this._schema = schema;
    this._banks = banks;
    this._bufferCache = bufferCache;
    this._initLfos(schema, startingBar, barStartTime);
  }

  isReady(): boolean {
    return this._buffer !== null;
  }

  async load(): Promise<void> {
    const url = this._resolveUrl();
    if (!url) return;

    if (!this._bufferCache.has(url)) {
      this._bufferCache.set(
        url,
        fetch(url)
          .then((r) => r.arrayBuffer())
          .then((b) => this._ctx.decodeAudioData(b))
          .catch(() => {
            console.warn(`[Sampler] Failed to load "${this._schema.bank}/${this._schema.sample}" from ${url}`);
            this._bufferCache.delete(url);
            return null;
          }),
      );
    }

    this._buffer = await this._bufferCache.get(url)!;
  }

  scheduleBar(_barIndex: number, _barStartTime: number): void {
    // Implemented in Step 3.3
    if (!this.isReady()) {
      console.warn(
        `[Sampler] "${this._schema.bank}/${this._schema.sample}" not yet loaded — skipping bar ${_barIndex}`,
      );
    }
  }

  private _resolveUrl(): string | null {
    const { bank, sample, variation } = this._schema;
    const bankSchema = this._banks[bank];

    if (!bankSchema) {
      console.warn(`[Sampler] Bank "${bank}" not found in schema`);
      return null;
    }

    const variations = bankSchema.samples[sample];
    if (!variations?.length) {
      console.warn(`[Sampler] Sample "${sample}" not found in bank "${bank}"`);
      return null;
    }

    const variationIndex = Math.min(
      Math.round(this._resolve(variation, 0, 0)),
      variations.length - 1,
    );
    return variations[variationIndex];
  }
}

export default Sampler;
