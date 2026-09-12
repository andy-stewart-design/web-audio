import type AudioClock from "@web-audio/clock";
import type {
  BankSchema,
  SamplerSchema,
  SampleVariationSchema,
} from "@web-audio/schema";
import Instrument, { type InstrumentRouting } from "./instrument";
import { SAMPLE_BASE_GAIN } from "@/constants";
import { planSamplerPreloads } from "@/utils/preload-samples";
import {
  deriveSourceKeys,
  resolveSample,
  resolveSampleEntry,
  selectNaturalSourceKey,
  selectNearestSourceKey,
} from "@/utils/resolve-sample-entry";
import SampleBufferCache from "./sample-buffer-cache";
import type {
  EventScheduleContext,
  ResolvedSamplerEvent,
  ResolvedSamplerVoice,
} from "@/types";
import { resolveSamplerEvents } from "./resolve-sampler-events";

interface SamplerOptions {
  schema: SamplerSchema;
  destination?: AudioNode;
  routing?: InstrumentRouting;
  banks: Record<string, BankSchema>;
  cache: SampleBufferCache;
  startingBar?: number;
  barStartTime?: number;
}

class Sampler extends Instrument {
  private _schema: SamplerSchema;
  private readonly _bufferCache: SampleBufferCache;
  private readonly _banks: Record<string, BankSchema>;
  private readonly _sampleName: string;
  private readonly _sourceKeys: readonly number[];
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
    }: SamplerOptions,
  ) {
    super(ctx, clock, {
      destination,
      routing,
      baseGain: SAMPLE_BASE_GAIN,
      muted: schema.muted,
    });
    this._schema = schema;
    this._banks = banks;
    this._sampleName = getFixedSampleName(schema);
    const sample = resolveSample(banks, schema.bank, this._sampleName);
    this._sourceKeys = sample ? deriveSourceKeys(sample) : [];
    this._bufferCache = cache;
    this._initLfos(schema, startingBar, barStartTime);
  }

  resetPlaybackState() {
    this._nextAlternateDirection = "forward";
  }

  override cancelFutureNotes() {
    super.cancelFutureNotes();
    this.resetPlaybackState();
  }

  async load() {
    await Promise.all(
      planSamplerPreloads(this._schema, this._banks).map(({ url, reverse }) =>
        this._bufferCache.prepare(url, reverse),
      ),
    );
  }

  scheduleBar(barIndex: number, barStartTime: number) {
    this._updateLfoParams(barIndex, barStartTime);

    this._scheduleResolvedBar(barIndex, barStartTime);
  }

  private _scheduleResolvedBar(barIndex: number, barStartTime: number) {
    const events = resolveSamplerEvents(
      this._schema.events,
      barIndex,
      this._valuePatternResolver,
    );

    for (const event of events) {
      for (const voice of event.voices) {
        this._scheduleResolvedSampleNote(voice, event, barStartTime, barIndex);
      }
    }
  }

  private _scheduleResolvedSampleNote(
    voice: ResolvedSamplerVoice,
    noteEvent: ResolvedSamplerEvent,
    barStartTime: number,
    barIndex: number,
  ) {
    const sourceKey =
      voice.note === undefined
        ? selectNaturalSourceKey(this._sourceKeys)
        : selectNearestSourceKey(this._sourceKeys, voice.note);
    if (sourceKey === null) {
      console.warn(
        `[Sampler] No source keys found for "${this._schema.bank}/${voice.sampleName}" — skipping voice`,
      );
      return;
    }
    const pitchRate =
      voice.note === undefined ? 1 : this._pitchRate(voice.note, sourceKey);
    const variation = resolveSampleEntry({
      banks: this._banks,
      bank: this._schema.bank,
      sample: voice.sampleName,
      sourceKey,
      variationIndex: voice.requestedVariationIndex,
    });
    if (!variation) {
      console.warn(
        `[Sampler] No entry found for "${this._schema.bank}/${voice.sampleName}" source ${sourceKey} variation ${voice.requestedVariationIndex} — skipping voice`,
      );
      return;
    }
    const reversed = this._isNextHitReversed();
    const buffer = this._bufferCache.get(variation.src, reversed);
    if (!buffer) {
      void this._bufferCache.prepare(variation.src, reversed);
      console.warn(
        `[Sampler] ${variation.src} not yet loaded — skipping voice in bar ${barIndex}`,
      );
      return;
    }
    const playbackSource = { buffer, entry: variation };
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
    noteEvent: ResolvedSamplerEvent,
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
        this._resolveValue(this._schema.region.start, barIndex, hitIndex),
      );
      if (this._schema.region.duration) {
        regionEnd = Math.min(
          regionStart +
            clamp(
              this._resolveValue(
                this._schema.region.duration,
                barIndex,
                hitIndex,
              ),
            ),
          1,
        );
      } else {
        regionEnd = clamp(
          this._resolveValue(this._schema.region.end, barIndex, hitIndex),
        );
      }
    } else if (this._schema.region?.type === "chop") {
      const { slices, sequence } = this._schema.region;
      if (slices.length === 0) return null;

      const rawIndex = Math.trunc(
        this._resolveValue(sequence, barIndex, hitIndex),
      );
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
}

function getFixedSampleName(schema: SamplerSchema) {
  for (const bar of schema.events.sampleNames.cycle) {
    for (const group of bar) {
      if (group?.[0]) return group[0];
    }
  }
  throw new Error("[Sampler] Expected a validated fixed sample name.");
}

export default Sampler;
