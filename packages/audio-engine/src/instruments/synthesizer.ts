import Instrument, { type InstrumentRouting } from "./instrument";
import MidiOutputScheduler from "@/midi-output-scheduler";
import { midiToFrequency } from "@/utils/midi-to-frequency";
import { resolveNoteEvents } from "./resolve-note-events";

import type { StaticSchemaValue, SynthesizerSchema } from "@web-audio/schema";
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

    if (this._schema.notes.mask?.type === "random") {
      this._scheduleRandomMaskedBar(barIndex, barStartTime);
    } else {
      this._scheduleResolvedBar(barIndex, barStartTime);
    }
  }

  private _scheduleResolvedBar(barIndex: number, barStartTime: number) {
    const events = resolveNoteEvents({
      notes: this._schema.notes,
      barIndex,
      resolveValue: (schema, currentBar, valueIndex) =>
        this._resolve(schema, currentBar, valueIndex),
    });

    for (const event of events) {
      for (const value of event.voices) {
        this._scheduleSynthNote(
          {
            value,
            offset: event.offset,
            duration: event.duration,
            stepIndex: event.gridStepIndex,
          },
          barStartTime,
          barIndex,
          event.hitIndex,
        );
      }
    }
  }

  private _scheduleRandomMaskedBar(barIndex: number, barStartTime: number) {
    const mask = this._schema.notes.mask;
    if (mask?.type !== "random") return;

    const maskBar = mask.grid.cycle[barIndex % mask.grid.cycle.length];
    const notes = this._schema.notes.source;
    const notesBar =
      notes.type === "static"
        ? notes.cycle[barIndex % notes.cycle.length]
        : undefined;
    if (notesBar?.length === 0) return;

    let emittedIndex = 0;
    for (const maskStep of maskBar) {
      if (this._resolve(mask, barIndex, maskStep.stepIndex) === 0) continue;

      const midiNote = notesBar
        ? notesBar[emittedIndex++ % notesBar.length].value
        : this._resolve(notes, barIndex, maskStep.stepIndex);
      this._scheduleSynthNote(
        { ...maskStep, value: midiNote },
        barStartTime,
        barIndex,
      );
    }
  }

  private _scheduleSynthNote(
    note: StaticSchemaValue,
    barStartTime: number,
    barIndex: number,
    // The random-mask scheduler keeps its existing grid-addressed fallback
    // until Step 3.3 migrates it to the shared note-event resolver.
    hitIndex = note.stepIndex,
  ): void {
    const barDuration = this._clock.barDuration;
    const startTime = barStartTime + note.offset * barDuration;
    const duration = note.duration * barDuration;
    const endTime = startTime + duration;
    const event = {
      barIndex,
      hitIndex,
      gridStepIndex: note.stepIndex,
      startTime,
      duration,
      endTime,
    } satisfies EventScheduleContext;

    const detune = this._resolveDetune(this._schema.detune, event);

    const osc = new OscillatorNode(this._ctx, {
      type: this._schema.waveform,
      frequency: midiToFrequency(note.value),
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
      note: note.value,
      velocity,
      startTime,
      endTime,
    });
  }
}

export default Synthesizer;
