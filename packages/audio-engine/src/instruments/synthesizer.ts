import Instrument from "./instrument";
import MidiOutputScheduler from "@/midi-output-scheduler";
import { midiToFrequency } from "@/utils/midi-to-frequency";

import type { StaticSchemaValue, SynthesizerSchema } from "@web-audio/schema";
import type AudioClock from "@web-audio/clock";

interface SynthesizerOptions {
  schema: SynthesizerSchema;
  destination?: AudioNode;
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
      muted: opts.schema.muted,
    });
    this._schema = opts.schema;
    this._midiOutputScheduler = opts.midiOutputScheduler;
    this._initLfos(opts.schema, opts.startingBar, opts.barStartTime);
  }

  scheduleBar(barIndex: number, barStartTime: number): void {
    this._updateLfoParams(barIndex, barStartTime);

    if (this._schema.triggerMask) {
      this._scheduleMaskedBar(barIndex, barStartTime);
    } else if (this._schema.notes.type === "random") {
      this._scheduleRandomBar(barIndex, barStartTime);
    } else {
      this._scheduleSequenceBar(barIndex, barStartTime);
    }
  }

  private _scheduleMaskedBar(barIndex: number, barStartTime: number) {
    const mask = this._schema.triggerMask;
    if (!mask || mask.type !== "static") return;

    const maskBar = mask.cycle[barIndex % mask.cycle.length];
    const notes = this._schema.notes;
    if (notes.type === "static") {
      const notesBar = notes.cycle[barIndex % notes.cycle.length];
      if (notesBar.length === 0) return;

      maskBar.forEach((maskStep, emittedIndex) => {
        const sourceNote = notesBar[emittedIndex % notesBar.length];
        this._scheduleSynthNote(
          { ...maskStep, value: sourceNote.value },
          barStartTime,
          barIndex,
        );
      });
      return;
    }

    maskBar.forEach((maskStep) => {
      const midiNote = this._resolve(notes, barIndex, maskStep.stepIndex);
      this._scheduleSynthNote(
        { ...maskStep, value: midiNote },
        barStartTime,
        barIndex,
      );
    });
  }

  private _scheduleRandomBar(barIndex: number, barStartTime: number): void {
    const notes = this._schema.notes;
    if (notes.type !== "random") return;

    const mask = notes.cycle.cycle[barIndex % notes.cycle.cycle.length];
    mask.forEach((step, stepIndex) => {
      if (step.value === 0) return;
      const midiNote = this._resolve(notes, barIndex, stepIndex);
      this._scheduleSynthNote(
        { ...step, value: midiNote },
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
      this._scheduleSynthNote(note, barStartTime, barIndex);
    });
  }

  private _scheduleSynthNote(
    note: StaticSchemaValue,
    barStartTime: number,
    barIndex: number,
  ): void {
    const barDuration = this._clock.barDuration;
    const startTime = barStartTime + note.offset * barDuration;
    const duration = note.duration * barDuration;
    const endTime = startTime + duration;

    const detune = this._resolveDetune(
      this._schema.detune,
      barIndex,
      note.stepIndex,
    );

    const osc = new OscillatorNode(this._ctx, {
      type: this._schema.waveform,
      frequency: midiToFrequency(note.value),
      detune: detune.value,
    });
    const noteContext = {
      barIndex,
      stepIndex: note.stepIndex,
      startTime,
      duration,
      endTime,
    };
    const gainEnvelope = this._resolveEnvelope(this._schema.gain, noteContext);

    this._scheduleVoice({
      source: osc,
      detune: { param: osc.detune, resolved: detune },
      gainEnvelope,
      effects: this._schema.effects,
      note: noteContext,
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
