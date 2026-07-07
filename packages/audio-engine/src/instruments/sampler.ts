import type AudioClock from "@web-audio/clock";
import type {
  BankSchema,
  SamplerSchema,
  SampleVariationSchema,
  StaticSchemaValue,
} from "@web-audio/schema";
import Instrument from "./instrument";
import { SAMPLE_BASE_GAIN } from "@/constants";
import { preloadVariationIndices } from "@/utils/preload-variations";
import SampleBufferStore, { type SampleCache } from "./sample-buffer-store";

interface SamplerOptions {
  schema: SamplerSchema;
  destination?: AudioNode;
  banks: Record<string, BankSchema>;
  cache: SampleCache;
  startingBar?: number;
  barStartTime?: number;
  fallbackBuffer?: AudioBuffer | null;
}

class Sampler extends Instrument {
  private _schema: SamplerSchema;
  private _bufferStore: SampleBufferStore;

  constructor(
    ctx: AudioContext,
    clock: AudioClock,
    {
      schema,
      destination,
      banks,
      cache,
      startingBar = 0,
      barStartTime,
      fallbackBuffer = null,
    }: SamplerOptions,
  ) {
    super(ctx, clock, destination ?? ctx.destination, SAMPLE_BASE_GAIN);
    this._schema = schema;
    this._bufferStore = new SampleBufferStore({
      ctx,
      banks,
      cache,
      bank: schema.bank,
      sample: schema.sample,
      initialVariationIndex: this._initialVariationIndex,
      initialSourceKey: this._schema.sourceKeys[0] ?? 0,
      fallbackBuffer,
    });
    this._initLfos(schema, startingBar, barStartTime);
  }

  isReady() {
    return this._bufferStore.hasInitialBuffer();
  }

  fallbackBufferFor(schema: SamplerSchema) {
    return this._bufferStore.fallbackBufferFor(schema.bank, schema.sample);
  }

  private get _initialVariationIndex() {
    return this._resolveVariationIndex(0, 0);
  }

  async load(): Promise<void> {
    await this._bufferStore.preload(
      preloadVariationIndices(this._schema),
      this._schema.sourceKeys,
    );
  }

  scheduleBar(barIndex: number, barStartTime: number) {
    if (!this._bufferStore.hasInitialBuffer()) {
      console.warn(
        `[Sampler] "${this._schema.bank}/${this._schema.sample}" not yet loaded — skipping bar ${barIndex}`,
      );
      return;
    }

    this._updateLfoParams(barIndex, barStartTime);

    switch (this._schema.notes.type) {
      case "random":
        this._scheduleRandomBar(barIndex, barStartTime);
        return;
      default:
        this._scheduleSequenceBar(barIndex, barStartTime);
        return;
    }
  }

  private _scheduleRandomBar(barIndex: number, barStartTime: number) {
    const notes = this._schema.notes;
    if (notes.type !== "random") return;

    // TODO: Update schema to make this notes.mask.cycle
    const mask = notes.cycle.cycle[barIndex % notes.cycle.cycle.length];
    mask.forEach((step, stepIndex) => {
      if (step.value === 0) return;
      const noteValue = this._resolve(notes, barIndex, stepIndex);
      const sourceKey = this._nearestSourceKey(noteValue);
      const pitchRate = this._pitchRate(noteValue, sourceKey);
      const variationIndex = this._resolveVariationIndex(barIndex, stepIndex);
      const playbackSource = this._bufferStore.getPlaybackSource(
        variationIndex,
        barIndex,
        sourceKey,
      );
      if (!playbackSource) return;
      this._scheduleSampleNote(
        playbackSource,
        { ...step, value: pitchRate },
        barStartTime,
        barIndex,
      );
    });
  }

  private _scheduleSequenceBar(barIndex: number, barStartTime: number) {
    const notes = this._schema.notes;
    if (notes.type !== "static") return;

    const notesBar = notes.cycle[barIndex % notes.cycle.length];
    notesBar.forEach((note) => {
      const sourceKey = this._nearestSourceKey(note.value);
      const pitchRate = this._pitchRate(note.value, sourceKey);
      const variationIndex = this._resolveVariationIndex(
        barIndex,
        note.stepIndex,
      );
      const playbackSource = this._bufferStore.getPlaybackSource(
        variationIndex,
        barIndex,
        sourceKey,
      );
      if (!playbackSource) return;
      this._scheduleSampleNote(
        playbackSource,
        { ...note, value: pitchRate },
        barStartTime,
        barIndex,
      );
    });
  }

  private _scheduleSampleNote(
    playbackSource: { buffer: AudioBuffer; entry: SampleVariationSchema },
    note: StaticSchemaValue,
    barStartTime: number,
    barIndex: number,
  ) {
    const { buffer, entry } = playbackSource;
    const barDuration = this._clock.barDuration;
    const startTime = barStartTime + note.offset * barDuration;
    const scheduledDuration = note.duration * barDuration;
    const offset =
      entry.type === "sprite" ? entry.start * buffer.duration : undefined;
    const entrySourceDuration = this._entrySourceDuration(buffer, entry);
    const fitRate = this._fitRate(entrySourceDuration);
    const playbackRate = note.value * fitRate;
    const playbackDuration = entrySourceDuration / playbackRate;
    const duration =
      this._schema.clipMode === "one-shot" && !this._schema.loop
        ? playbackDuration
        : Math.min(scheduledDuration, playbackDuration);
    const endTime = startTime + duration;

    const detune = this._resolveDetune(
      this._schema.detune,
      barIndex,
      note.stepIndex,
    );

    const source = new AudioBufferSourceNode(this._ctx, {
      buffer,
      playbackRate,
      detune: detune.value,
      loop: this._schema.loop,
    });

    this._scheduleVoice({
      source,
      detune: {
        param: source.detune,
        resolved: detune,
      },
      gainEnvelope: this._schema.gain,
      effects: this._schema.effects,
      note: {
        barIndex,
        stepIndex: note.stepIndex,
        startTime,
        duration,
        endTime,
      },
      offset,
    });
  }

  private _nearestSourceKey(note: number) {
    return this._schema.sourceKeys.reduce((nearest, key) =>
      Math.abs(key - note) < Math.abs(nearest - note) ? key : nearest,
    );
  }

  private _pitchRate(note: number, sourceKey: number) {
    return Math.pow(2, (note - sourceKey) / 12);
  }

  private _fitRate(sourceDuration: number) {
    if (!this._schema.fit) return 1;
    return sourceDuration / (this._schema.fit.bars * this._clock.barDuration);
  }

  private _entrySourceDuration(
    buffer: AudioBuffer,
    entry: SampleVariationSchema,
  ) {
    return entry.type === "sprite"
      ? (entry.end - entry.start) * buffer.duration
      : buffer.duration;
  }

  private _resolveVariationIndex(barIndex: number, stepIndex: number): number {
    return Math.round(
      this._resolve(this._schema.variation, barIndex, stepIndex),
    );
  }
}

export default Sampler;
