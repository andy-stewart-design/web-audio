import type AudioClock from "@web-audio/clock";
import type { BankSchema, SamplerSchema } from "@web-audio/schema";
import Instrument from "./instrument";

interface SamplerOptions {
  schema: SamplerSchema;
  banks: Record<string, BankSchema>;
  startingBar?: number;
  barStartTime?: number;
}

class Sampler extends Instrument {
  private _schema: SamplerSchema;
  private _banks: Record<string, BankSchema>;
  private _buffer: AudioBuffer | null = null;

  constructor(
    ctx: AudioContext,
    clock: AudioClock,
    { schema, banks, startingBar = 0, barStartTime }: SamplerOptions,
  ) {
    super(ctx, clock);
    this._schema = schema;
    this._banks = banks;
    this._initLfos(schema, startingBar, barStartTime);
  }

  isReady(): boolean {
    return this._buffer !== null;
  }

  async load(): Promise<void> {
    const { bank, sample, variation } = this._schema;
    const variationIndex = this._resolve(variation, 0, 0);
    const bankSchema = this._banks[bank];

    if (!bankSchema) {
      console.warn(`[Sampler] Bank "${bank}" not found in schema`);
      return;
    }

    const variations = bankSchema.samples[sample];
    if (!variations?.length) {
      console.warn(`[Sampler] Sample "${sample}" not found in bank "${bank}"`);
      return;
    }

    const url =
      variations[Math.min(Math.round(variationIndex), variations.length - 1)];

    try {
      const res = await fetch(url);
      const arrayBuffer = await res.arrayBuffer();
      this._buffer = await this._ctx.decodeAudioData(arrayBuffer);
    } catch {
      console.warn(`[Sampler] Failed to load "${bank}/${sample}" from ${url}`);
    }
  }

  scheduleBar(_barIndex: number, _barStartTime: number): void {
    // Implemented in Step 3.3
    if (!this.isReady()) {
      console.warn(
        `[Sampler] "${this._schema.bank}/${this._schema.sample}" not yet loaded — skipping bar ${_barIndex}`,
      );
    }
  }
}

export default Sampler;
