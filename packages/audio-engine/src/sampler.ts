import type AudioClock from "@web-audio/clock";
import type { BankSchema, SamplerSchema, StaticSchemaValue } from "@web-audio/schema";
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

    const buffer = await this._bufferCache.get(url)!;
    if (buffer) this._buffer = buffer;
  }

  scheduleBar(barIndex: number, barStartTime: number): void {
    if (!this.isReady()) {
      console.warn(
        `[Sampler] "${this._schema.bank}/${this._schema.sample}" not yet loaded — skipping bar ${barIndex}`,
      );
      return;
    }

    this._updateLfoParams(barIndex, barStartTime);

    const notes = this._schema.notes;

    if (notes.type === "fit") {
      // Handled in Step 3.4
      return;
    }

    if (notes.type === "random") {
      const mask = notes.cycle.cycle[barIndex % notes.cycle.cycle.length];
      mask.forEach((step, stepIndex) => {
        if (step.value === 0) return;
        const rate = this._resolve(notes, barIndex, stepIndex);
        this._scheduleNote({ ...step, value: rate }, barStartTime, barIndex);
      });
      return;
    }

    const notesBar = notes.cycle[barIndex % notes.cycle.length];
    notesBar.forEach((note) => {
      this._scheduleNote(note, barStartTime, barIndex);
    });
  }

  private _scheduleNote(
    note: StaticSchemaValue,
    barStartTime: number,
    barIndex: number,
  ): void {
    const buffer = this._buffer!;
    const barDuration = this._clock.barDuration;
    const startTime = barStartTime + note.offset * barDuration;
    const noteDuration = note.duration * barDuration;
    const endTime = startTime + noteDuration;

    const detune = this._resolveDetune(this._schema.detune, barIndex, note.stepIndex);

    const source = new AudioBufferSourceNode(this._ctx, {
      buffer,
      playbackRate: note.value,
      detune: detune.value,
      loop: this._schema.loop,
    });
    const gain = new GainNode(this._ctx);

    const releaseDur = this._scheduleParamEnvelope(
      gain.gain,
      this._schema.gain,
      barIndex,
      note.stepIndex,
      noteDuration,
      endTime,
    );

    if (detune.type === "envelope") {
      this._scheduleParamEnvelope(
        source.detune,
        detune.schema,
        barIndex,
        note.stepIndex,
        noteDuration,
        endTime,
      );
    } else if (detune.type === "lfo") {
      const lfoNode = this._lfoNodes.get(detune.schema.id);
      if (lfoNode) lfoNode.connect(source.detune);
    }

    const effectNodes = this._schema.effects.map((effect) =>
      this._buildEffectNode(effect, barIndex, note.stepIndex, startTime, noteDuration, endTime),
    );

    source.connect(gain);
    const chain: AudioNode[] = [gain, ...effectNodes];
    chain.reduce((src, dst) => { src.connect(dst); return dst; });
    chain[chain.length - 1].connect(this._outputNode);

    source.start(startTime);
    source.stop(endTime + releaseDur + 0.05);

    this._track(source, chain, startTime);
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
