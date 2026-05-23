import type AudioClock from "@web-audio/clock";
import type {
  BankSchema,
  SamplerSchema,
  StaticSchemaValue,
} from "@web-audio/schema";
import Instrument from "./instrument";
import { SAMPLE_BASE_GAIN } from "@/constants";
import { preloadVariationIndices } from "@/utils/preload-variations";
import SampleBufferStore, { type SampleCache } from "./sample-buffer-store";

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
  private _bufferStore: SampleBufferStore;

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
    super(ctx, clock, SAMPLE_BASE_GAIN);
    this._schema = schema;
    this._bufferStore = new SampleBufferStore({
      ctx,
      banks,
      cache,
      bank: schema.bank,
      sample: schema.sample,
      initialVariationIndex: this._initialVariationIndex,
      fallbackBuffer,
    });
    this._initLfos(schema, startingBar, barStartTime);
  }

  isReady(): boolean {
    return this._bufferStore.hasInitialBuffer();
  }

  fallbackBufferFor(schema: SamplerSchema): AudioBuffer | null {
    return this._bufferStore.fallbackBufferFor(schema.bank, schema.sample);
  }

  private get _initialVariationIndex(): number {
    return this._resolveVariationIndex(0, 0);
  }

  async load(): Promise<void> {
    await this._bufferStore.preload(preloadVariationIndices(this._schema));
  }

  scheduleBar(barIndex: number, barStartTime: number): void {
    if (!this._bufferStore.hasInitialBuffer()) {
      console.warn(
        `[Sampler] "${this._schema.bank}/${this._schema.sample}" not yet loaded — skipping bar ${barIndex}`,
      );
      return;
    }

    this._updateLfoParams(barIndex, barStartTime);

    switch (this._schema.notes.type) {
      case "fit":
        this._scheduleFitBar(barIndex, barStartTime);
        return;
      case "random":
        this._scheduleRandomBar(barIndex, barStartTime);
        return;
      default:
        this._scheduleSequenceBar(barIndex, barStartTime);
        return;
    }
  }

  private _scheduleFitBar(barIndex: number, barStartTime: number): void {
    const notes = this._schema.notes;
    if (notes.type !== "fit") return;

    // Only trigger at the start of each N-bar window
    if (barIndex % notes.bars !== 0) return;

    const variationIndex = this._resolveVariationIndex(barIndex, 0);
    const buffer = this._bufferStore.getPlaybackBuffer(
      variationIndex,
      barIndex,
    );
    if (!buffer) return;

    const barDuration = this._clock.barDuration;
    const playbackRate = buffer.duration / (notes.bars * barDuration);
    const fitDuration = notes.bars * barDuration;

    const source = new AudioBufferSourceNode(this._ctx, {
      buffer,
      playbackRate,
      loop: this._schema.loop,
    });

    this._scheduleVoice({
      source,
      gainEnvelope: this._schema.gain,
      effects: this._schema.effects,
      barIndex,
      stepIndex: 0,
      startTime: barStartTime,
      noteDuration: fitDuration,
      endTime: barStartTime + fitDuration,
      stopTime: barStartTime + fitDuration,
    });
  }

  private _scheduleRandomBar(barIndex: number, barStartTime: number): void {
    const notes = this._schema.notes;
    if (notes.type !== "random") return;

    // TODO: Update schema to make this notes.mask.cycle
    const mask = notes.cycle.cycle[barIndex % notes.cycle.cycle.length];
    mask.forEach((step, stepIndex) => {
      if (step.value === 0) return;
      const rate = this._resolve(notes, barIndex, stepIndex);
      const variationIndex = this._resolveVariationIndex(barIndex, stepIndex);
      const buffer = this._bufferStore.getPlaybackBuffer(
        variationIndex,
        barIndex,
      );
      if (!buffer) return;
      this._scheduleSampleNote(
        buffer,
        { ...step, value: rate },
        barStartTime,
        barIndex,
      );
    });
  }

  private _scheduleSequenceBar(barIndex: number, barStartTime: number): void {
    const notes = this._schema.notes;
    if (notes.type !== "static") return;

    const notesBar = notes.cycle[barIndex % notes.cycle.length];
    notesBar.forEach((note) => {
      const variationIndex = this._resolveVariationIndex(
        barIndex,
        note.stepIndex,
      );
      const buffer = this._bufferStore.getPlaybackBuffer(
        variationIndex,
        barIndex,
      );
      if (!buffer) return;
      this._scheduleSampleNote(buffer, note, barStartTime, barIndex);
    });
  }

  private _scheduleSampleNote(
    buffer: AudioBuffer,
    note: StaticSchemaValue,
    barStartTime: number,
    barIndex: number,
  ) {
    const barDuration = this._clock.barDuration;
    const startTime = barStartTime + note.offset * barDuration;
    const noteDuration = note.duration * barDuration;
    const sampleDuration = buffer.duration / note.value;
    const duration =
      this._schema.durationMode === "one-shot" && !this._schema.loop
        ? sampleDuration
        : noteDuration;
    const endTime = startTime + duration;

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

    this._scheduleVoice({
      source,
      detuneParam: source.detune,
      detune,
      gainEnvelope: this._schema.gain,
      effects: this._schema.effects,
      barIndex,
      stepIndex: note.stepIndex,
      startTime,
      noteDuration,
      endTime,
    });
  }

  private _resolveVariationIndex(
    barIndex: number,
    stepIndex: number,
  ): number {
    return Math.round(
      this._resolve(this._schema.variation, barIndex, stepIndex),
    );
  }
}

export default Sampler;
