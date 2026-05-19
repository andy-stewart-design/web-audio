import type AudioClock from "@web-audio/clock";
import type {
  BankSchema,
  SamplerSchema,
  StaticSchemaValue,
} from "@web-audio/schema";
import Instrument from "./instrument";

interface SampleCache {
  resolved: Map<string, AudioBuffer>;
  promises: Map<string, Promise<AudioBuffer | null>>;
}

interface SamplerOptions {
  schema: SamplerSchema;
  banks: Record<string, BankSchema>;
  cache: SampleCache;
  startingBar?: number;
  barStartTime?: number;
  fallbackBuffer?: AudioBuffer | null;
}

class Sampler extends Instrument {
  private _schema: SamplerSchema;
  private _banks: Record<string, BankSchema>;
  private _cache: SampleCache;
  private _buffer: AudioBuffer | null = null;
  private _fallbackBuffer: AudioBuffer | null;

  constructor(
    ctx: AudioContext,
    clock: AudioClock,
    {
      schema,
      banks,
      cache,
      startingBar = 0,
      barStartTime,
      fallbackBuffer = null,
    }: SamplerOptions,
  ) {
    super(ctx, clock);
    this._schema = schema;
    this._banks = banks;
    this._cache = cache;
    this._fallbackBuffer = fallbackBuffer;
    this._initLfos(schema, startingBar, barStartTime);
  }

  isReady(): boolean {
    return this._playbackBuffer !== null;
  }

  fallbackBufferFor(schema: SamplerSchema): AudioBuffer | null {
    if (this._schema.bank !== schema.bank) return null;
    if (this._schema.sample !== schema.sample) return null;
    return this._playbackBuffer;
  }

  private get _playbackBuffer(): AudioBuffer | null {
    return this._buffer ?? this._fallbackBuffer;
  }

  async load(): Promise<void> {
    const url = this._resolveUrl();
    if (!url) return;

    // Synchronous hit — buffer already decoded, set _buffer before any yield
    const resolved = this._cache.resolved.get(url);
    if (resolved) {
      this._buffer = resolved;
      return;
    }

    let promise = this._cache.promises.get(url);
    if (!promise) {
      promise = fetch(url)
        .then((r) => r.arrayBuffer())
        .then((b) => this._ctx.decodeAudioData(b))
        .catch(() => {
          console.warn(
            `[Sampler] Failed to load "${this._schema.bank}/${this._schema.sample}" from ${url}`,
          );
          this._cache.promises.delete(url);
          return null;
        });
      this._cache.promises.set(url, promise);
    }

    const buffer = await promise;
    if (buffer) {
      this._cache.resolved.set(url, buffer);
      this._buffer = buffer;
    }
  }

  scheduleBar(barIndex: number, barStartTime: number): void {
    const buffer = this._playbackBuffer;
    if (!buffer) {
      console.warn(
        `[Sampler] "${this._schema.bank}/${this._schema.sample}" not yet loaded — skipping bar ${barIndex}`,
      );
      return;
    }

    this._updateLfoParams(barIndex, barStartTime);

    const notes = this._schema.notes;

    if (notes.type === "fit") {
      // Only trigger at the start of each N-bar window
      if (barIndex % notes.bars !== 0) return;

      const barDuration = this._clock.barDuration;
      const playbackRate = buffer.duration / (notes.bars * barDuration);

      const source = new AudioBufferSourceNode(this._ctx, {
        buffer,
        playbackRate,
        loop: this._schema.loop,
      });
      const gain = new GainNode(this._ctx);
      const fitDuration = notes.bars * barDuration;

      this._scheduleParamEnvelope(
        gain.gain,
        this._schema.gain,
        barIndex,
        0,
        fitDuration,
        barStartTime + fitDuration,
      );

      const effectNodes = this._schema.effects.map((effect) =>
        this._buildEffectNode(
          effect,
          barIndex,
          0,
          barStartTime,
          fitDuration,
          barStartTime + fitDuration,
        ),
      );

      source.connect(gain);
      const chain: AudioNode[] = [gain, ...effectNodes];
      chain.reduce((src, dst) => {
        src.connect(dst);
        return dst;
      });
      chain[chain.length - 1].connect(this._outputNode);

      source.start(barStartTime);
      source.stop(barStartTime + fitDuration);

      this._track(source, chain, barStartTime);
      return;
    }

    if (notes.type === "random") {
      const mask = notes.cycle.cycle[barIndex % notes.cycle.cycle.length];
      mask.forEach((step, stepIndex) => {
        if (step.value === 0) return;
        const rate = this._resolve(notes, barIndex, stepIndex);
        this._scheduleNote(
          buffer,
          { ...step, value: rate },
          barStartTime,
          barIndex,
        );
      });
      return;
    }

    const notesBar = notes.cycle[barIndex % notes.cycle.length];
    notesBar.forEach((note) => {
      this._scheduleNote(buffer, note, barStartTime, barIndex);
    });
  }

  private _scheduleNote(
    buffer: AudioBuffer,
    note: StaticSchemaValue,
    barStartTime: number,
    barIndex: number,
  ) {
    const barDuration = this._clock.barDuration;
    const startTime = barStartTime + note.offset * barDuration;
    const noteDuration = note.duration * barDuration;
    const endTime = startTime + noteDuration;

    const detune = this._resolveDetune(
      this._schema.detune,
      barIndex,
      note.stepIndex,
    );

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
      this._buildEffectNode(
        effect,
        barIndex,
        note.stepIndex,
        startTime,
        noteDuration,
        endTime,
      ),
    );

    source.connect(gain);
    const chain: AudioNode[] = [gain, ...effectNodes];
    chain.reduce((src, dst) => {
      src.connect(dst);
      return dst;
    });
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
