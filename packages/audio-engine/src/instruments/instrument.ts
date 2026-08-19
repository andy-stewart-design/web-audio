import type AudioClock from "@web-audio/clock";
import type { Midi } from "@web-audio/midi";
import type {
  AudioParamSchema,
  EffectSchema,
  InstrumentSchema,
} from "@web-audio/schema";
import ParameterManager from "@/automation/parameter-manager";
import { SYNTH_BASE_GAIN, FILTER_TYPE_MAP } from "@/constants";
import type {
  ResolvedDetune,
  ResolvedEnvelopeSchema,
  ScheduledNote,
} from "@/types";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface InstrumentOptions {
  destination?: AudioNode;
  baseGain?: number;
  muted?: boolean;
}

interface NoteScheduleContext {
  barIndex: number;
  stepIndex: number;
  startTime: number;
  duration: number;
  endTime: number;
}

interface BaseScheduleVoiceParams {
  note: NoteScheduleContext;
  detune?: {
    param: AudioParam;
    resolved: ResolvedDetune;
  };
  gainEnvelope: ResolvedEnvelopeSchema;
  effects: EffectSchema[];
  stopTime?: number;
}

type ScheduleVoiceParams = BaseScheduleVoiceParams &
  (
    | { source: AudioBufferSourceNode; offset: number }
    | { source: AudioScheduledSourceNode; offset?: undefined }
  );

// -----------------------------------------------------------------------------
// Main Class
// -----------------------------------------------------------------------------

abstract class Instrument {
  // Dependencies
  protected _ctx: AudioContext;
  protected _clock: AudioClock;

  // Output graph
  protected readonly _balancingNode: GainNode;
  protected readonly _muteNode: GainNode;

  // Voice and parameter state
  private _scheduled: Set<ScheduledNote> = new Set();
  protected readonly _parameters: ParameterManager;

  // Lifecycle state
  private _retired = false;
  private _finished = false;
  private _destroyed = false;
  private _finishedResolve: (() => void) | null = null;
  readonly finished: Promise<void>;

  // ---------------------------------------------------------------------------
  // Public lifecycle
  // ---------------------------------------------------------------------------

  constructor(
    ctx: AudioContext,
    clock: AudioClock,
    {
      destination = ctx.destination,
      baseGain = SYNTH_BASE_GAIN,
      muted = false,
    }: InstrumentOptions = {},
  ) {
    this._ctx = ctx;
    this._clock = clock;
    this._parameters = new ParameterManager(ctx, clock);
    this._balancingNode = ctx.createGain();
    this._muteNode = ctx.createGain();
    this._balancingNode.gain.value = baseGain;
    this._muteNode.gain.value = muted ? 0 : 1;
    this._balancingNode.connect(this._muteNode);
    this._muteNode.connect(destination);
    this.finished = new Promise<void>((resolve) => {
      this._finishedResolve = resolve;
    });
  }

  abstract scheduleBar(barIndex: number, barStartTime: number): void;

  connectMidi(midi: Midi) {
    if (this._retired || this._destroyed) return;
    this._parameters.connectMidi(midi);
  }

  disconnectMidi() {
    this._parameters.disconnectMidi();
  }

  cancelFutureNotes() {
    const now = this._ctx.currentTime;
    for (const note of this._scheduled) {
      note.midiBindings.forEach((unbind) => unbind());
      if (note.startTime <= now) continue;
      note.sourceNode.onended = null;
      note.sourceNode.stop(0);
      note.sourceNode.disconnect();
      for (const node of note.audioNodes) node.disconnect();
      this._scheduled.delete(note);
    }
    this._finish();
  }

  retire() {
    if (this._retired || this._destroyed) return;
    this._retired = true;
    this.disconnectMidi();
    this._finish();
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this.disconnectMidi();

    for (const note of this._scheduled) {
      note.midiBindings.forEach((unbind) => unbind());
      note.sourceNode.onended = null;
      note.sourceNode.stop(0);
      note.sourceNode.disconnect();
      for (const node of note.audioNodes) node.disconnect();
    }

    this._scheduled.clear();
    this._parameters.destroy();
    this._balancingNode.disconnect();
    this._muteNode.disconnect();
    this._finished = true;
    this._finishedResolve?.();
  }

  // ---------------------------------------------------------------------------
  // Voice scheduling
  // ---------------------------------------------------------------------------

  protected _scheduleVoice(params: ScheduleVoiceParams) {
    const { source, note, detune, gainEnvelope, effects } = params;
    const midiBindings: (() => void)[] = [];

    const gain = new GainNode(this._ctx);

    const releaseDur = this._parameters.scheduleParamEnvelope(
      gain.gain,
      gainEnvelope,
      note,
    );

    if (detune) {
      if (detune.resolved.type === "envelope") {
        this._parameters.scheduleParamEnvelope(
          detune.param,
          this._parameters.resolveEnvelope(detune.resolved.schema, note),
          note,
        );
      } else if (detune.resolved.type === "lfo") {
        this._parameters.connectLfo(
          detune.param,
          detune.resolved.schema,
          midiBindings,
        );
      } else if (detune.resolved.type === "midi-cc") {
        this._parameters.applyParamSchema(
          detune.param,
          detune.resolved.schema,
          note,
          1,
          midiBindings,
        );
      }
    }

    const effectNodes = effects.map((effect) =>
      this._buildEffectNode(effect, note, midiBindings),
    );

    source.connect(gain);

    const chain: AudioNode[] = [gain, ...effectNodes];
    chain.reduce((src, dst) => {
      src.connect(dst);
      return dst;
    });

    chain[chain.length - 1].connect(this._balancingNode);

    if (params.offset !== undefined) {
      params.source.start(note.startTime, params.offset);
    } else {
      source.start(note.startTime);
    }

    source.stop(params.stopTime ?? note.endTime + releaseDur + 0.05);
    this._track(source, chain, note.startTime, midiBindings);
  }

  protected _buildEffectNode(
    effect: EffectSchema,
    note: NoteScheduleContext,
    midiBindings: (() => void)[],
  ) {
    switch (effect.type) {
      case "filter": {
        const node = new BiquadFilterNode(this._ctx, {
          type: FILTER_TYPE_MAP[effect.filterType],
        });
        for (const [param, schema] of [
          [node.frequency, effect.frequency],
          [node.Q, effect.q],
          [node.detune, effect.detune],
          [node.gain, effect.gain],
        ] as const) {
          this._parameters.applyParamSchema(
            param,
            schema,
            note,
            1,
            midiBindings,
          );
        }
        return node;
      }
      case "gain": {
        const node = new GainNode(this._ctx);
        this._parameters.applyParamSchema(
          node.gain,
          effect.gain,
          note,
          1,
          midiBindings,
        );
        return node;
      }
    }
  }

  protected _track(
    sourceNode: AudioScheduledSourceNode,
    audioNodes: AudioNode[],
    startTime: number,
    midiBindings: (() => void)[] = [],
  ) {
    const scheduled = {
      sourceNode,
      audioNodes,
      midiBindings,
      startTime,
    } satisfies ScheduledNote;
    this._scheduled.add(scheduled);

    sourceNode.onended = () => {
      sourceNode.disconnect();
      for (const n of audioNodes) n.disconnect();
      midiBindings.forEach((unbind) => unbind());
      this._scheduled.delete(scheduled);
      this._finish();
    };
  }

  // ---------------------------------------------------------------------------
  // LFO lifecycle
  // ---------------------------------------------------------------------------

  protected _initLfos(
    schema: InstrumentSchema,
    startingBar = 0,
    barStartTime?: number,
  ) {
    const params: AudioParamSchema[] = [schema.detune];
    for (const effect of schema.effects) {
      if (effect.type === "filter") {
        params.push(effect.frequency, effect.q, effect.detune, effect.gain);
      } else {
        params.push(effect.gain);
      }
    }
    this._parameters.initializeLfos(params, startingBar, barStartTime);
  }

  // ---------------------------------------------------------------------------
  // Retirement completion
  // ---------------------------------------------------------------------------

  private _finish() {
    if (!this._retired || this._finished || this._scheduled.size > 0) return;
    this._finished = true;
    this._parameters.destroy();
    this._finishedResolve?.();
  }
}

export default Instrument;
export type { ScheduledNote };
