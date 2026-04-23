import type {
  EffectSchema,
  FilterType,
  StaticSchemaValue,
  SynthesizerSchema,
} from "@web-audio/schema";
import type AudioClock from "@web-audio/clock";
import Instrument from "./instrument";
import { midiToFrequency } from "./utils/midi-to-frequency";

const FILTER_TYPE_MAP: Record<FilterType, BiquadFilterType> = {
  lp: "lowpass",
  hp: "highpass",
  bp: "bandpass",
  notch: "notch",
  ap: "allpass",
  pk: "peaking",
  ls: "lowshelf",
  hs: "highshelf",
};

class Synthesizer extends Instrument {
  private _schema: SynthesizerSchema;

  constructor(ctx: AudioContext, clock: AudioClock, schema: SynthesizerSchema) {
    super(ctx, clock);
    this._schema = schema;
  }

  scheduleBar(barIndex: number, barStartTime: number): void {
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

  private _buildEffectNode(
    effect: EffectSchema,
    barIndex: number,
    stepIndex: number,
    startTime: number,
    noteDuration: number,
    endTime: number,
  ): AudioNode {
    switch (effect.type) {
      case "filter": {
        const node = this._ctx.createBiquadFilter();
        node.type = FILTER_TYPE_MAP[effect.filterType];
        for (const [param, schema] of [
          [node.frequency, effect.frequency],
          [node.Q, effect.q],
          [node.detune, effect.detune],
          [node.gain, effect.gain],
        ] as const) {
          if (schema.type === "envelope") {
            this._scheduleParamEnvelope(
              param,
              schema,
              barIndex,
              stepIndex,
              noteDuration,
              endTime,
            );
          } else {
            param.setValueAtTime(
              this._resolve(schema, barIndex, stepIndex),
              startTime,
            );
          }
        }
        return node;
      }
    }
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

    const detune = this._schema.detune;
    const staticDetune =
      detune.type !== "envelope"
        ? this._resolve(detune, barIndex, note.stepIndex)
        : 0;

    const osc = new OscillatorNode(this._ctx, {
      type: this._schema.waveform,
      frequency: midiToFrequency(note.value),
      detune: staticDetune,
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
        detune,
        barIndex,
        note.stepIndex,
        noteDuration,
        endTime,
      );
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
