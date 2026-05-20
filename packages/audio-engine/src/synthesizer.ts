import Instrument from "./instrument";
import { midiToFrequency } from "./utils/midi-to-frequency";

import type { StaticSchemaValue, SynthesizerSchema } from "@web-audio/schema";
import type AudioClock from "@web-audio/clock";

interface SynthesizerOptions {
  schema: SynthesizerSchema;
  startingBar?: number;
  barStartTime?: number;
}

class Synthesizer extends Instrument {
  protected _schema: SynthesizerSchema;

  constructor(
    ctx: AudioContext,
    clock: AudioClock,
    { schema, startingBar = 0, barStartTime }: SynthesizerOptions,
  ) {
    super(ctx, clock);
    this._schema = schema;
    this._initLfos(schema, startingBar, barStartTime);
  }

  scheduleBar(barIndex: number, barStartTime: number): void {
    this._updateLfoParams(barIndex, barStartTime);
    const notes = this._schema.notes;

    if (notes.type === "random") {
      const mask = notes.cycle.cycle[barIndex % notes.cycle.cycle.length];
      mask.forEach((step, stepIndex) => {
        if (step.value === 0) return;
        const midiNote = this._resolve(notes, barIndex, stepIndex);
        this._scheduleNote(
          { ...step, value: midiNote },
          barStartTime,
          barIndex,
        );
      });
      return;
    }

    const notesBar = notes.cycle[barIndex % notes.cycle.length];
    notesBar.forEach((note) => {
      this._scheduleNote(note, barStartTime, barIndex);
    });
  }

  private _scheduleNote(
    note: StaticSchemaValue,
    barStartTime: number,
    barIndex: number,
  ): void {
    const barDuration = this._clock.barDuration;
    const startTime = barStartTime + note.offset * barDuration;
    const noteDuration = note.duration * barDuration;
    const endTime = startTime + noteDuration;

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
        osc.detune,
        detune.schema,
        barIndex,
        note.stepIndex,
        noteDuration,
        endTime,
      );
    } else if (detune.type === "lfo") {
      const lfoNode = this._lfoNodes.get(detune.schema.id);
      if (lfoNode) lfoNode.connect(osc.detune);
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

    osc.connect(gain);
    const chain: AudioNode[] = [gain, ...effectNodes];
    chain.reduce((src, dst) => {
      src.connect(dst);
      return dst;
    });
    chain[chain.length - 1].connect(this._outputNode);
    osc.start(startTime);
    osc.stop(endTime + releaseDur + 0.05);

    this._track(osc, chain, startTime);
  }
}

export default Synthesizer;
