import type { EventScheduleContext } from "../events/types";
import type { InstrumentClock } from "./types";
import type {
  ResolvedDetune,
  ResolvedEnvelopeSchema,
} from "../parameters/types";
import type {
  BasicSynthesizerSchema,
  UnisonSynthesizerSchema,
  SynthesizerSchema,
} from "@web-audio/schema";
import Instrument, {
  safeAudioParamValue,
  type InstrumentOptions,
} from "./instrument";
import MidiOutputScheduler from "@/midi/midi-output-scheduler";
import { midiToFrequency } from "@/midi/midi-to-frequency";
import { resolveSynthEvents } from "../events/resolve-synth-events";
import SupersawSource, { toAudioFrame } from "../sources/supersaw-source";

interface SynthesizerOptions extends InstrumentOptions {
  schema: SynthesizerSchema;
  midiOutputScheduler?: MidiOutputScheduler;
}

class Synthesizer extends Instrument {
  protected _schema: SynthesizerSchema;
  private _midiOutputScheduler?: MidiOutputScheduler;

  constructor(
    ctx: BaseAudioContext,
    clock: InstrumentClock,
    opts: SynthesizerOptions,
  ) {
    super(ctx, clock, {
      destination: opts.destination,
      routing: opts.routing,
      muted: opts.schema.muted,
      onDuck: opts.onDuck,
    });
    this._schema = opts.schema;
    this._midiOutputScheduler = opts.midiOutputScheduler;
    this._initLfos(opts.schema, opts.startingBar, opts.barStartTime, [
      ...(opts.schema.sourceGain ? [opts.schema.sourceGain] : []),
      ...(opts.schema.engine === "unison"
        ? [opts.schema.spread, opts.schema.width]
        : []),
      ...(opts.schema.noise ? [opts.schema.noise.gain] : []),
    ]);
  }

  scheduleBar(barIndex: number, barStartTime: number): void {
    this._updateLfoParams(barIndex, barStartTime);

    this._scheduleResolvedBar(barIndex, barStartTime);
  }

  private _scheduleResolvedBar(barIndex: number, barStartTime: number) {
    const events = resolveSynthEvents(
      this._schema.eventPattern,
      barIndex,
      this._valuePatternResolver,
    );

    const barDuration = this._clock.barDuration;
    for (const resolved of events) {
      const startTime = barStartTime + resolved.offset * barDuration;
      const duration = resolved.duration * barDuration;
      const event = {
        barIndex,
        hitIndex: resolved.hitIndex,
        startTime,
        duration,
        endTime: startTime + duration,
      } satisfies EventScheduleContext;

      this._emitDuckTriggers(this._schema.ducks, startTime, duration);
      resolved.notes.forEach((midiNote, voiceIndex) => {
        this._scheduleSynthNote(midiNote, event, voiceIndex);
      });
    }
  }

  private _scheduleSynthNote(
    midiNote: number,
    event: EventScheduleContext,
    voiceIndex: number,
  ): void {
    const detune = this._resolveDetune(this._schema.detune, event);
    const gainEnvelope = this._resolveEnvelope(this._schema.gain, event);
    const notesOut = this._schema.notesOut;

    if (this._schema.engine === "unison") {
      this._scheduleUnisonNote(
        this._schema,
        midiNote,
        event,
        voiceIndex,
        detune,
        gainEnvelope,
      );
    } else {
      this._scheduleBasicNote(
        this._schema,
        midiNote,
        event,
        detune,
        gainEnvelope,
      );
    }

    const velocity = Math.min(
      127,
      Math.max(0, Math.round(gainEnvelope.max * 127)),
    );
    if (!notesOut || !this._midiOutputScheduler || velocity === 0) return;
    this._midiOutputScheduler.scheduleNote({
      ...(notesOut.device === undefined ? {} : { selector: notesOut.device }),
      channel: notesOut.channel,
      note: midiNote,
      velocity,
      startTime: event.startTime,
      endTime: event.endTime,
    });
  }

  private _scheduleBasicNote(
    schema: BasicSynthesizerSchema,
    midiNote: number,
    event: EventScheduleContext,
    detune: ResolvedDetune,
    gainEnvelope: ResolvedEnvelopeSchema,
  ) {
    const osc = new OscillatorNode(this._ctx, {
      type: schema.waveform,
      frequency: safeAudioParamValue(midiToFrequency(midiNote)),
      detune: safeAudioParamValue(detune.value),
    });

    this._scheduleVoice({
      sources: [{ node: osc }],
      sourceGain: schema.sourceGain,
      detune: { param: osc.detune, resolved: detune },
      gainEnvelope,
      effects: schema.effects,
      event,
      noise: schema.noise
        ? {
            color: schema.noise.color,
            gain: schema.noise.gain,
          }
        : undefined,
    });
  }

  private _scheduleUnisonNote(
    schema: UnisonSynthesizerSchema,
    midiNote: number,
    event: EventScheduleContext,
    voiceIndex: number,
    detune: ResolvedDetune,
    gainEnvelope: ResolvedEnvelopeSchema,
  ) {
    const resolvedVoices = this._valuePatternResolver.resolve(
      schema.voices,
      event.barIndex,
      event.hitIndex,
    );
    const voices = Math.min(
      8,
      Math.max(
        1,
        Math.round(Number.isFinite(resolvedVoices) ? resolvedVoices : 7),
      ),
    );
    const stopTime = this._resolveVoiceStopTime(gainEnvelope, event);
    const source = new SupersawSource(this._ctx, {
      voices,
      phaseSeed: phaseSeed(event, midiNote, voiceIndex),
      startFrame: toAudioFrame(this._ctx, event.startTime),
      stopFrame: toAudioFrame(this._ctx, stopTime),
    });
    source.frequency.setValueAtTime(
      safeAudioParamValue(midiToFrequency(midiNote)),
      event.startTime,
    );
    if (detune.type === "static") {
      source.detune.setValueAtTime(
        safeAudioParamValue(detune.value),
        event.startTime,
      );
    }

    this._scheduleVoice({
      sources: [{ node: source }],
      sourceGain: schema.sourceGain,
      detune: { param: source.detune, resolved: detune },
      sourceParams: [
        { param: source.spread, schema: schema.spread },
        { param: source.width, schema: schema.width },
      ],
      gainEnvelope,
      effects: schema.effects,
      event,
      noise: schema.noise
        ? {
            color: schema.noise.color,
            gain: schema.noise.gain,
          }
        : undefined,
      stopTime,
    });
  }
}

function phaseSeed(
  event: EventScheduleContext,
  midiNote: number,
  voiceIndex: number,
) {
  let value = 0x811c9dc5;
  value = Math.imul(value ^ event.barIndex, 0x01000193);
  value = Math.imul(value ^ event.hitIndex, 0x01000193);
  value = Math.imul(value ^ midiNote, 0x01000193);
  value = Math.imul(value ^ voiceIndex, 0x01000193);
  return value >>> 0;
}

export default Synthesizer;
