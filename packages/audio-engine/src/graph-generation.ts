import type AudioClock from "@web-audio/clock";
import type { Midi } from "@web-audio/midi";
import type { DromeSchema, SamplerSchema } from "@web-audio/schema";
import Bus from "@/buses/bus";
import { FILTER_SETTLING_TIME, RETIREMENT_FADE_TIME } from "@/constants";
import Sampler from "@/instruments/sampler";
import type { SampleCache } from "@/instruments/sample-buffer-store";
import Synthesizer from "@/instruments/synthesizer";
import type MidiOutputScheduler from "@/midi-output-scheduler";
import AudioTimeScheduler from "@/utils/audio-time-scheduler";

interface GenerationTiming {
  barDuration: number;
  startingBar: number;
  barStartTime: number;
}

interface GraphGenerationOptions {
  ctx: AudioContext;
  schema: DromeSchema;
  destination: AudioNode;
  cache: SampleCache;
  timing: GenerationTiming;
  midiOutputScheduler?: MidiOutputScheduler;
  midi?: Midi | null;
  previous?: GraphGeneration | null;
}

type GenerationInstrument = Synthesizer | Sampler;

class GraphGeneration {
  private readonly _ctx: AudioContext;
  private readonly _retirementGain: GainNode;
  private readonly _buses: Map<string, Bus>;
  private readonly _instruments: GenerationInstrument[];
  private readonly _scheduler: AudioTimeScheduler;
  private _midi: Midi | null = null;
  private _retired = false;
  private _destroyed = false;
  private _finishedResolve!: () => void;
  readonly finished: Promise<void>;

  private constructor(
    ctx: AudioContext,
    retirementGain: GainNode,
    buses: Map<string, Bus>,
    instruments: GenerationInstrument[],
  ) {
    this._ctx = ctx;
    this._retirementGain = retirementGain;
    this._buses = buses;
    this._instruments = instruments;
    this._scheduler = new AudioTimeScheduler(ctx);
    this.finished = new Promise<void>((resolve) => {
      this._finishedResolve = resolve;
    });
  }

  static create(options: GraphGenerationOptions) {
    const cleanups: (() => void)[] = [];
    try {
      // Generation scheduling must not observe a clock whose BPM has not yet
      // been committed. Runtime hosts only require this prospective duration.
      const schedulingClock = {
        barDuration: options.timing.barDuration,
      } as AudioClock;
      const retirementGain = options.ctx.createGain();
      retirementGain.gain.value = 1;
      cleanups.push(() => retirementGain.disconnect());
      retirementGain.connect(options.destination);

      const buses = new Map<string, Bus>();
      const main = new Bus(options.ctx, schedulingClock, {
        schema: options.schema.buses.main,
        destination: retirementGain,
        startingBar: options.timing.startingBar,
        barStartTime: options.timing.barStartTime,
      });
      buses.set("main", main);
      cleanups.push(() => main.destroy());

      for (const [name, schema] of Object.entries(options.schema.buses)) {
        if (name === "main") continue;
        const bus = new Bus(options.ctx, schedulingClock, {
          schema,
          destination: main.input,
          startingBar: options.timing.startingBar,
          barStartTime: options.timing.barStartTime,
        });
        buses.set(name, bus);
        cleanups.push(() => bus.destroy());
      }

      const instruments: GenerationInstrument[] = [];
      for (const [index, schema] of options.schema.instruments.entries()) {
        let instrument: GenerationInstrument;
        if (schema.type === "sampler") {
          instrument = new Sampler(options.ctx, schedulingClock, {
            schema,
            destination: main.input,
            banks: options.schema.banks,
            cache: options.cache,
            startingBar: options.timing.startingBar,
            barStartTime: options.timing.barStartTime,
            fallbackBuffer: options.previous?.fallbackBufferFor(schema, index),
          });
          void instrument.load();
        } else {
          instrument = new Synthesizer(options.ctx, schedulingClock, {
            schema,
            destination: main.input,
            startingBar: options.timing.startingBar,
            barStartTime: options.timing.barStartTime,
            midiOutputScheduler: options.midiOutputScheduler,
          });
        }
        instruments.push(instrument);
        cleanups.push(() => instrument.destroy());
      }

      const generation = new GraphGeneration(
        options.ctx,
        retirementGain,
        buses,
        instruments,
      );
      if (options.midi) generation.connectMidi(options.midi);
      cleanups.length = 0;
      return generation;
    } catch (error) {
      for (const cleanup of cleanups.reverse()) cleanup();
      throw error;
    }
  }

  scheduleBar(barIndex: number, barStartTime: number) {
    if (this._destroyed || this._retired) return;
    for (const bus of this._buses.values()) {
      bus.scheduleBar(barIndex, barStartTime);
    }
    for (const instrument of this._instruments) {
      instrument.scheduleBar(barIndex, barStartTime);
    }
  }

  stop() {
    if (this._destroyed) return;
    for (const instrument of this._instruments) instrument.cancelFutureNotes();
    for (const bus of this._buses.values()) bus.stop();
  }

  connectMidi(midi: Midi) {
    if (this._destroyed || this._retired || this._midi === midi) return;
    this.disconnectMidi();
    this._midi = midi;
    for (const bus of this._buses.values()) bus.connectMidi(midi);
    for (const instrument of this._instruments) instrument.connectMidi(midi);
  }

  disconnectMidi() {
    if (!this._midi) return;
    for (const bus of this._buses.values()) bus.disconnectMidi();
    for (const instrument of this._instruments) instrument.disconnectMidi();
    this._midi = null;
  }

  retire() {
    if (this._retired || this._destroyed) return;
    this._retired = true;
    this.disconnectMidi();
    for (const instrument of this._instruments) instrument.retire();
    void this._completeRetirement();
  }

  fallbackBufferFor(schema: SamplerSchema, index: number) {
    const instrument = this._instruments[index];
    if (!(instrument instanceof Sampler)) return null;
    return instrument.fallbackBufferFor(schema);
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this.disconnectMidi();
    this._scheduler.destroy();
    for (const instrument of this._instruments) instrument.destroy();
    for (const bus of this._buses.values()) bus.destroy();
    this._retirementGain.disconnect();
    this._finishedResolve();
  }

  private async _completeRetirement() {
    await Promise.all(
      this._instruments.map((instrument) => instrument.finished),
    );
    if (this._destroyed) return;

    const settled = await this._scheduler.waitUntil(
      this._ctx.currentTime + FILTER_SETTLING_TIME,
    ).promise;
    if (!settled || this._destroyed) return;

    const fadeStart = this._ctx.currentTime;
    const fadeEnd = fadeStart + RETIREMENT_FADE_TIME;
    this._retirementGain.gain.cancelScheduledValues(fadeStart);
    this._retirementGain.gain.setValueAtTime(1, fadeStart);
    this._retirementGain.gain.linearRampToValueAtTime(0, fadeEnd);
    const faded = await this._scheduler.waitUntil(fadeEnd).promise;
    if (!faded || this._destroyed) return;
    this._finishedResolve();
  }
}

export default GraphGeneration;
export type { GenerationTiming, GraphGenerationOptions };
