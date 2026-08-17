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
    super(ctx, clock, {
      destination,
      baseGain: SAMPLE_BASE_GAIN,
      muted: schema.muted,
    });
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
      prepareReverse: schema.direction !== "forward",
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

    if (this._schema.notes.mask) {
      this._scheduleMaskedBar(barIndex, barStartTime);
    } else if (this._schema.notes.source.type === "random") {
      this._scheduleRandomBar(barIndex, barStartTime);
    } else {
      this._scheduleSequenceBar(barIndex, barStartTime);
    }
  }

  private _scheduleMaskedBar(barIndex: number, barStartTime: number) {
    const mask = this._schema.notes.mask;
    if (!mask) return;

    const maskBar =
      mask.type === "random"
        ? mask.grid.cycle[barIndex % mask.grid.cycle.length]
        : mask.cycle[barIndex % mask.cycle.length];
    const notes = this._schema.notes.source;
    const notesBar =
      notes.type === "static"
        ? notes.cycle[barIndex % notes.cycle.length]
        : undefined;
    if (notesBar?.length === 0) return;

    let emittedIndex = 0;
    for (const maskStep of maskBar) {
      if (
        mask.type === "random" &&
        this._resolve(mask, barIndex, maskStep.stepIndex) === 0
      ) {
        continue;
      }

      const noteValue = notesBar
        ? notesBar[emittedIndex++ % notesBar.length].value
        : this._resolve(notes, barIndex, maskStep.stepIndex);
      this._scheduleResolvedSampleNote(
        { ...maskStep, value: noteValue },
        barStartTime,
        barIndex,
      );
    }
  }

  private _scheduleRandomBar(barIndex: number, barStartTime: number) {
    const notes = this._schema.notes.source;
    if (notes.type !== "random") return;

    const steps = notes.grid.cycle[barIndex % notes.grid.cycle.length];
    steps.forEach((step, stepIndex) => {
      if (step.value === 0) return;
      const noteValue = this._resolve(notes, barIndex, stepIndex);
      this._scheduleResolvedSampleNote(
        { ...step, value: noteValue },
        barStartTime,
        barIndex,
      );
    });
  }

  private _scheduleSequenceBar(barIndex: number, barStartTime: number) {
    const notes = this._schema.notes.source;
    if (notes.type !== "static") return;

    const notesBar = notes.cycle[barIndex % notes.cycle.length];
    notesBar.forEach((note) => {
      this._scheduleResolvedSampleNote(note, barStartTime, barIndex);
    });
  }

  private _scheduleResolvedSampleNote(
    note: StaticSchemaValue,
    barStartTime: number,
    barIndex: number,
  ) {
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
    const sourceWindow = this._resolveSourceWindow(
      buffer,
      entry,
      barIndex,
      note.stepIndex,
    );
    if (!sourceWindow) return;

    const fitRate = this._fitRate(sourceWindow.fitDuration);
    const playbackRate = note.value * fitRate;
    const playbackDuration = sourceWindow.duration / playbackRate;
    const duration =
      this._schema.loop || sourceWindow.isFittedChop
        ? scheduledDuration
        : this._schema.clipMode === "one-shot"
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
      loopStart: sourceWindow.loopStart,
      loopEnd: sourceWindow.loopEnd,
    });
    const noteContext = {
      barIndex,
      stepIndex: note.stepIndex,
      startTime,
      duration,
      endTime,
    };

    this._scheduleVoice({
      source,
      detune: {
        param: source.detune,
        resolved: detune,
      },
      gainEnvelope: this._resolveEnvelope(this._schema.gain, noteContext),
      effects: this._schema.effects,
      note: noteContext,
      offset: sourceWindow.offset,
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

  private _resolveSourceWindow(
    buffer: AudioBuffer,
    entry: SampleVariationSchema,
    barIndex: number,
    stepIndex: number,
  ) {
    const entryStart = entry.type === "sprite" ? entry.start : 0;
    const entryEnd = entry.type === "sprite" ? entry.end : 1;
    const entryDuration = entryEnd - entryStart;

    let regionStart = 0;
    let regionEnd = 1;
    if (this._schema.region?.type === "static") {
      const clamp = (value: number) => Math.min(1, Math.max(0, value));
      regionStart = clamp(
        this._resolve(this._schema.region.start, barIndex, stepIndex),
      );
      if (this._schema.region.duration) {
        regionEnd = Math.min(
          regionStart +
            clamp(
              this._resolve(this._schema.region.duration, barIndex, stepIndex),
            ),
          1,
        );
      } else {
        regionEnd = clamp(
          this._resolve(this._schema.region.end, barIndex, stepIndex),
        );
      }
    } else if (this._schema.region?.type === "chop") {
      const { slices, sequence } = this._schema.region;
      if (slices.length === 0) return null;

      const rawIndex = Math.trunc(this._resolve(sequence, barIndex, stepIndex));
      const sliceIndex =
        ((rawIndex % slices.length) + slices.length) % slices.length;
      const slice = slices[sliceIndex];
      regionStart = slice.start;
      regionEnd = slice.end;
    }

    if (regionEnd <= regionStart) {
      console.warn(
        `[Sampler] Skipping note with invalid region window start=${regionStart}, end=${regionEnd}.`,
      );
      return null;
    }

    const normalizedStart = entryStart + regionStart * entryDuration;
    const normalizedEnd = entryStart + regionEnd * entryDuration;

    const fitDuration =
      this._schema.region?.type === "chop"
        ? this._chopFitDuration(entryDuration * buffer.duration)
        : (normalizedEnd - normalizedStart) * buffer.duration;

    const offset = normalizedStart * buffer.duration;
    const isDurationRegion =
      this._schema.region?.type === "static" && !!this._schema.region.duration;

    return {
      offset:
        entry.type === "file" && !this._schema.region ? undefined : offset,
      duration: (normalizedEnd - normalizedStart) * buffer.duration,
      loopStart: isDurationRegion ? offset : undefined,
      loopEnd: isDurationRegion ? normalizedEnd * buffer.duration : undefined,
      fitDuration,
      isFittedChop: this._schema.region?.type === "chop" && !!this._schema.fit,
    };
  }

  private _chopFitDuration(entrySourceDuration: number) {
    if (this._schema.region?.type !== "chop") return entrySourceDuration;

    const starts = this._schema.region.slices.map((slice) => slice.start);
    const ends = this._schema.region.slices.map((slice) => slice.end);
    const start = Math.min(...starts);
    const end = Math.max(...ends);
    return (end - start) * entrySourceDuration;
  }

  private _resolveVariationIndex(barIndex: number, stepIndex: number): number {
    return Math.round(
      this._resolve(this._schema.variation, barIndex, stepIndex),
    );
  }
}

export default Sampler;
