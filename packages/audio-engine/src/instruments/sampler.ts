import type AudioClock from "@web-audio/clock";
import type {
  BankSchema,
  SamplerSchema,
  SampleVariationSchema,
} from "@web-audio/schema";
import Instrument, { type InstrumentRouting } from "./instrument";
import { SAMPLE_BASE_GAIN } from "@/constants";
import { preloadVariationIndices } from "@/utils/preload-variations";
import SampleBufferStore, { type SampleCache } from "./sample-buffer-store";
import type { EventScheduleContext } from "@/types";
import {
  resolveNoteEvents,
  type ResolvedNoteEvent,
} from "./resolve-note-events";

interface SamplerOptions {
  schema: SamplerSchema;
  destination?: AudioNode;
  routing?: InstrumentRouting;
  banks: Record<string, BankSchema>;
  cache: SampleCache;
  startingBar?: number;
  barStartTime?: number;
  fallbackBuffer?: AudioBuffer | null;
}

class Sampler extends Instrument {
  private _schema: SamplerSchema;
  private _bufferStore: SampleBufferStore;
  private _nextAlternateDirection: "forward" | "reverse" = "forward";

  constructor(
    ctx: AudioContext,
    clock: AudioClock,
    {
      schema,
      destination,
      routing,
      banks,
      cache,
      startingBar = 0,
      barStartTime,
      fallbackBuffer = null,
    }: SamplerOptions,
  ) {
    super(ctx, clock, {
      destination,
      routing,
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

  resetPlaybackState() {
    this._nextAlternateDirection = "forward";
  }

  override cancelFutureNotes() {
    super.cancelFutureNotes();
    this.resetPlaybackState();
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

    this._scheduleResolvedBar(barIndex, barStartTime);
  }

  private _scheduleResolvedBar(barIndex: number, barStartTime: number) {
    const events = resolveNoteEvents({
      notes: this._schema.notes,
      barIndex,
      resolveValue: (schema, currentBar, valueIndex) =>
        this._resolve(schema, currentBar, valueIndex),
    });

    for (const event of events) {
      for (const noteValue of event.voices) {
        this._scheduleResolvedSampleNote(
          noteValue,
          event,
          barStartTime,
          barIndex,
        );
      }
    }
  }

  private _scheduleResolvedSampleNote(
    noteValue: number,
    noteEvent: ResolvedNoteEvent,
    barStartTime: number,
    barIndex: number,
  ) {
    const sourceKey = this._nearestSourceKey(noteValue);
    const pitchRate = this._pitchRate(noteValue, sourceKey);
    const variationIndex = this._resolveVariationIndex(
      barIndex,
      noteEvent.hitIndex,
    );
    const reversed = this._isNextHitReversed();
    const playbackSource = this._bufferStore.getPlaybackSource(
      variationIndex,
      barIndex,
      sourceKey,
      reversed,
    );
    if (!playbackSource) return;
    const emitted = this._scheduleSampleNote(
      playbackSource,
      pitchRate,
      noteEvent,
      barStartTime,
      barIndex,
      reversed,
    );
    if (emitted && this._schema.direction === "alternate") {
      this._nextAlternateDirection =
        this._nextAlternateDirection === "forward" ? "reverse" : "forward";
    }
  }

  private _scheduleSampleNote(
    playbackSource: { buffer: AudioBuffer; entry: SampleVariationSchema },
    pitchRate: number,
    noteEvent: ResolvedNoteEvent,
    barStartTime: number,
    barIndex: number,
    reversed: boolean,
  ) {
    const { buffer, entry } = playbackSource;
    const barDuration = this._clock.barDuration;
    const startTime = barStartTime + noteEvent.offset * barDuration;
    const scheduledDuration = noteEvent.duration * barDuration;
    const sourceWindow = this._resolveSourceWindow(
      buffer,
      entry,
      barIndex,
      noteEvent.hitIndex,
      reversed,
    );
    if (!sourceWindow) return false;

    const fitRate = this._fitRate(sourceWindow.fitDuration);
    const playbackRate = pitchRate * fitRate;
    const playbackDuration = sourceWindow.duration / playbackRate;
    const duration =
      this._schema.loop || sourceWindow.isFittedChop
        ? scheduledDuration
        : this._schema.clipMode === "one-shot"
          ? playbackDuration
          : Math.min(scheduledDuration, playbackDuration);
    const endTime = startTime + duration;
    const event = {
      barIndex,
      hitIndex: noteEvent.hitIndex,
      gridStepIndex: noteEvent.gridStepIndex,
      startTime,
      duration,
      endTime,
    } satisfies EventScheduleContext;

    const detune = this._resolveDetune(this._schema.detune, event);

    const source = new AudioBufferSourceNode(this._ctx, {
      buffer,
      playbackRate,
      detune: detune.value,
      loop: this._schema.loop,
      loopStart: sourceWindow.loopStart,
      loopEnd: sourceWindow.loopEnd,
    });

    this._scheduleVoice({
      source,
      detune: {
        param: source.detune,
        resolved: detune,
      },
      gainEnvelope: this._resolveEnvelope(this._schema.gain, event),
      effects: this._schema.effects,
      event,
      offset: sourceWindow.offset,
    });
    return true;
  }

  private _isNextHitReversed() {
    if (this._schema.direction === "reverse") return true;
    if (this._schema.direction === "alternate") {
      return this._nextAlternateDirection === "reverse";
    }
    return false;
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
    hitIndex: number,
    reversed: boolean,
  ) {
    const entryStart = entry.type === "sprite" ? entry.start : 0;
    const entryEnd = entry.type === "sprite" ? entry.end : 1;
    const entryDuration = entryEnd - entryStart;

    let regionStart = 0;
    let regionEnd = 1;
    if (this._schema.region?.type === "static") {
      const clamp = (value: number) => Math.min(1, Math.max(0, value));
      regionStart = clamp(
        this._resolve(this._schema.region.start, barIndex, hitIndex),
      );
      if (this._schema.region.duration) {
        regionEnd = Math.min(
          regionStart +
            clamp(
              this._resolve(this._schema.region.duration, barIndex, hitIndex),
            ),
          1,
        );
      } else {
        regionEnd = clamp(
          this._resolve(this._schema.region.end, barIndex, hitIndex),
        );
      }
    } else if (this._schema.region?.type === "chop") {
      const { slices, sequence } = this._schema.region;
      if (slices.length === 0) return null;

      const rawIndex = Math.trunc(this._resolve(sequence, barIndex, hitIndex));
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

    const sourceStart = normalizedStart * buffer.duration;
    const sourceEnd = normalizedEnd * buffer.duration;
    const playbackStart = reversed ? buffer.duration - sourceEnd : sourceStart;
    const playbackEnd = reversed ? buffer.duration - sourceStart : sourceEnd;
    const isDurationRegion =
      this._schema.region?.type === "static" && !!this._schema.region.duration;
    const hasExplicitOffset =
      reversed || entry.type !== "file" || !!this._schema.region;

    return {
      offset: hasExplicitOffset ? playbackStart : undefined,
      duration: sourceEnd - sourceStart,
      loopStart: isDurationRegion ? playbackStart : undefined,
      loopEnd: isDurationRegion ? playbackEnd : undefined,
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

  private _resolveVariationIndex(barIndex: number, hitIndex: number): number {
    return Math.round(
      this._resolve(this._schema.variation, barIndex, hitIndex),
    );
  }
}

export default Sampler;
