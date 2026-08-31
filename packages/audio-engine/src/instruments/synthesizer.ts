import Instrument, { type InstrumentRouting } from "./instrument";
import MidiOutputScheduler from "@/midi-output-scheduler";
import { midiToFrequency } from "@/utils/midi-to-frequency";
import { resolveNoteEvents } from "./resolve-note-events";

import type { SynthesizerSchema } from "@web-audio/schema";
import type AudioClock from "@web-audio/clock";
import type { EventScheduleContext } from "@/types";

interface SynthesizerOptions {
  schema: SynthesizerSchema;
  destination?: AudioNode;
  routing?: InstrumentRouting;
  startingBar?: number;
  barStartTime?: number;
  midiOutputScheduler?: MidiOutputScheduler;
}

class Synthesizer extends Instrument {
  protected _schema: SynthesizerSchema;
  private _midiOutputScheduler?: MidiOutputScheduler;

  constructor(ctx: AudioContext, clock: AudioClock, opts: SynthesizerOptions) {
    super(ctx, clock, {
      destination: opts.destination,
      routing: opts.routing,
      muted: opts.schema.muted,
    });
    this._schema = opts.schema;
    this._midiOutputScheduler = opts.midiOutputScheduler;
    this._initLfos(opts.schema, opts.startingBar, opts.barStartTime);
  }

  scheduleBar(barIndex: number, barStartTime: number): void {
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

    const barDuration = this._clock.barDuration;
    for (const resolved of events) {
      const startTime = barStartTime + resolved.offset * barDuration;
      const duration = resolved.duration * barDuration;
      const event = {
        barIndex,
        hitIndex: resolved.hitIndex,
        gridStepIndex: resolved.gridStepIndex,
        startTime,
        duration,
        endTime: startTime + duration,
      } satisfies EventScheduleContext;

      for (const midiNote of resolved.voices) {
        this._scheduleSynthNote(midiNote, event);
      }
    }
  }

  private _scheduleSynthNote(
    midiNote: number,
    event: EventScheduleContext,
  ): void {
    const detune = this._resolveDetune(this._schema.detune, event);

    const osc = new OscillatorNode(this._ctx, {
      type: this._schema.waveform,
      frequency: midiToFrequency(midiNote),
      detune: detune.value,
    });
    const gainEnvelope = this._resolveEnvelope(this._schema.gain, event);

    this._scheduleVoice({
      source: osc,
      detune: { param: osc.detune, resolved: detune },
      gainEnvelope,
      effects: this._schema.effects,
      event,
    });

    const notesOut = this._schema.notesOut;
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
}

export default Synthesizer;
