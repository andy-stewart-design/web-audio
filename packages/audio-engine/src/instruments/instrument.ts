import type AudioClock from "@web-audio/clock";
import type { Midi } from "@web-audio/midi";
import type {
  AudioParamSchema,
  EffectSchema,
  EnvelopeSchema,
  InstrumentSchema,
  LfoSchema,
  MidiCcSchema,
  ParameterSchema,
  RandomSchema,
} from "@web-audio/schema";
import type { ResolvedDetune } from "@/types";
import RandomResolver from "@/resolvers/random-resolver";
import { SYNTH_BASE_GAIN, FILTER_TYPE_MAP } from "@/constants";
import { computeEnvelope } from "@/utils/compute-envelope";
import type { ScheduledNote, ResolvedEnvelopeSchema } from "@/types";

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

type MidiBinding = (midi: Midi | null) => void;

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

  // Voice state
  private _scheduled: Set<ScheduledNote> = new Set();
  private _resolvers = new Map<RandomSchema, RandomResolver>();

  // LFO state
  protected _lfoNodes = new Map<string, AudioWorkletNode>();
  protected _lfoSchemas = new Map<string, LfoSchema>();

  // MIDI state
  private _midi: Midi | null = null;
  private _midiBindings = new Set<MidiBinding>();

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
    if (this._retired || this._destroyed || this._midi === midi) return;
    this._midi = midi;
    this._midiBindings.forEach((bind) => bind(midi));
  }

  disconnectMidi() {
    if (!this._midi) return;
    this._midi = null;
    this._midiBindings.forEach((bind) => bind(null));
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
    this._midiBindings.clear();

    for (const note of this._scheduled) {
      note.midiBindings.forEach((unbind) => unbind());
      note.sourceNode.onended = null;
      note.sourceNode.stop(0);
      note.sourceNode.disconnect();
      for (const node of note.audioNodes) node.disconnect();
    }

    this._scheduled.clear();
    this._cleanupLfos();
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

    const releaseDur = this._scheduleParamEnvelope(
      gain.gain,
      gainEnvelope,
      note,
    );

    if (detune) {
      if (detune.resolved.type === "envelope") {
        this._scheduleParamEnvelope(
          detune.param,
          this._resolveEnvelope(detune.resolved.schema, note),
          note,
        );
      } else if (detune.resolved.type === "lfo") {
        const lfoNode = this._lfoNodes.get(detune.resolved.schema.id);
        if (lfoNode) lfoNode.connect(detune.param);
      } else if (detune.resolved.type === "midi-cc") {
        midiBindings.push(
          this._bindMidiParam(detune.param, detune.resolved.schema, 1),
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
          this._applyParamSchema(param, schema, note, 1, midiBindings);
        }
        return node;
      }
      case "gain": {
        const node = new GainNode(this._ctx);
        this._applyParamSchema(node.gain, effect.gain, note, 1, midiBindings);
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
  // Parameter resolution and automation
  // ---------------------------------------------------------------------------

  protected _applyParamSchema(
    param: AudioParam,
    schema: AudioParamSchema,
    note: NoteScheduleContext,
    scale = 1,
    midiBindings: (() => void)[] = [],
  ) {
    if (schema.type === "midi-cc") {
      midiBindings.push(this._bindMidiParam(param, schema, scale));
    } else if (schema.type === "lfo") {
      const node = this._lfoNodes.get(schema.id);
      if (node) node.connect(param);
    } else if (schema.type === "envelope") {
      this._scheduleParamEnvelope(
        param,
        this._resolveEnvelope(schema, note),
        note,
        scale,
      );
    } else {
      param.setValueAtTime(
        this._resolve(schema, note.barIndex, note.stepIndex) * scale,
        note.startTime,
      );
    }
  }

  protected _resolveDetune(
    schema: AudioParamSchema,
    barIndex: number,
    stepIndex: number,
  ) {
    let value = 0;
    switch (schema.type) {
      case "midi-cc":
        return {
          type: "midi-cc",
          value: schema.default,
          schema,
        } satisfies ResolvedDetune;
      case "lfo":
        return { type: "lfo", schema, value } satisfies ResolvedDetune;
      case "envelope":
        value = schema.min;
        return { type: "envelope", schema, value } satisfies ResolvedDetune;
      default:
        value = this._resolve(schema, barIndex, stepIndex);
        return { type: "static", value } satisfies ResolvedDetune;
    }
  }

  protected _resolveEnvelope(
    envelope: EnvelopeSchema,
    note: NoteScheduleContext,
  ) {
    return {
      min: envelope.min,
      max: this._resolve(envelope.max, note.barIndex, note.stepIndex),
      a: this._resolve(envelope.a, note.barIndex, note.stepIndex),
      d: this._resolve(envelope.d, note.barIndex, note.stepIndex),
      s: this._resolve(envelope.s, note.barIndex, note.stepIndex),
      r: this._resolve(envelope.r, note.barIndex, note.stepIndex),
      mode: envelope.mode,
    } satisfies ResolvedEnvelopeSchema;
  }

  protected _scheduleParamEnvelope(
    param: AudioParam,
    envelope: ResolvedEnvelopeSchema,
    note: NoteScheduleContext,
    scale = 1,
  ): number {
    const env = computeEnvelope(envelope, note.duration, note.endTime, scale);
    const decay = env.startTime + env.attackDur + env.decayDur;

    param.setValueAtTime(env.min, env.startTime);
    param.linearRampToValueAtTime(env.max, env.startTime + env.attackDur);
    param.linearRampToValueAtTime(env.sustain, decay);
    param.setValueAtTime(env.sustain, env.endTime);
    param.linearRampToValueAtTime(env.min, env.endTime + env.releaseDur);

    return env.releaseDur;
  }

  protected _resolve(
    schema: ParameterSchema,
    barIndex: number,
    stepIndex: number,
  ) {
    if (schema.type === "random") {
      return this._getResolver(schema).resolve(barIndex, stepIndex);
    }
    const bar = schema.cycle[barIndex % schema.cycle.length];
    return bar[stepIndex % bar.length].value;
  }

  private _getResolver(schema: RandomSchema) {
    let resolver = this._resolvers.get(schema);
    if (!resolver) {
      resolver = new RandomResolver(schema);
      this._resolvers.set(schema, resolver);
    }
    return resolver;
  }

  // ---------------------------------------------------------------------------
  // MIDI parameter bindings
  // ---------------------------------------------------------------------------

  protected _registerMidiBinding(bind: MidiBinding) {
    this._midiBindings.add(bind);
    bind(this._midi);
    return () => {
      if (!this._midiBindings.delete(bind)) return;
      bind(null);
    };
  }

  private _bindMidiParam(
    param: AudioParam,
    schema: MidiCcSchema,
    scale: number,
  ) {
    let unsubscribe: (() => void) | null = null;
    param.value = schema.default * scale;

    return this._registerMidiBinding((midi) => {
      unsubscribe?.();
      unsubscribe = null;
      if (!midi) return;

      const unscoped =
        schema.device === undefined
          ? midi.in.cc(schema.cc)
          : midi.in.cc(schema.device, schema.cc);
      const signal =
        schema.channel === undefined
          ? unscoped
          : unscoped.channel(schema.channel);
      let isInitialized = false;
      unsubscribe = signal.subscribe((value) => {
        const mapped = signal.hasValue
          ? this._mapMidiCc(value, schema)
          : schema.default;
        if (!isInitialized) {
          isInitialized = true;
          param.value = mapped * scale;
          return;
        }
        param.setTargetAtTime(mapped * scale, this._ctx.currentTime, 0.01);
      });
    });
  }

  private _mapMidiCc(value: number, schema: MidiCcSchema) {
    const { min, max, curve } = schema.range;
    if (curve === "exponential") {
      return min * Math.pow(max / min, value);
    }
    return min + (max - min) * value;
  }

  // ---------------------------------------------------------------------------
  // LFO lifecycle
  // ---------------------------------------------------------------------------

  protected _initLfos(
    schema: InstrumentSchema,
    startingBar = 0,
    barStartTime?: number,
  ) {
    const register = (lfo: LfoSchema) => {
      if (this._lfoNodes.has(lfo.id)) return;
      // barOriginTime is the audio time of bar 0. The worklet uses this
      // with currentFrame to compute the exact phase at any point, so
      // single-speed LFOs stay perfectly locked to the bar grid without
      // accumulation drift.
      const effectiveBarStart = barStartTime ?? this._ctx.currentTime;
      const barOriginTime =
        effectiveBarStart - startingBar * this._clock.barDuration;
      const node = new AudioWorkletNode(this._ctx, "lfo-processor", {
        parameterData: {
          outputA: this._resolve(lfo.outputA, 0, 0),
          outputB: this._resolve(lfo.outputB, 0, 0),
        },
        processorOptions: {
          waveform: lfo.waveform,
          speed: lfo.speed,
          initialPhase: lfo.phase,
          norm: lfo.norm,
          invert: lfo.invert,
          barDuration: this._clock.barDuration,
          barOriginTime,
        },
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      this._lfoNodes.set(lfo.id, node);
      this._lfoSchemas.set(lfo.id, lfo);
    };

    if (schema.detune.type === "lfo") register(schema.detune);
    for (const effect of schema.effects) {
      if (effect.type === "filter") {
        for (const param of [
          effect.frequency,
          effect.q,
          effect.detune,
          effect.gain,
        ]) {
          if (param.type === "lfo") register(param);
        }
      } else if (effect.type === "gain") {
        if (effect.gain.type === "lfo") register(effect.gain);
      }
    }
  }

  protected _updateLfoParams(barIndex: number, barStartTime: number) {
    for (const [id, schema] of this._lfoSchemas) {
      const node = this._lfoNodes.get(id);
      if (!node) continue;
      const outputA = this._resolve(schema.outputA, barIndex, 0);
      const outputB = this._resolve(schema.outputB, barIndex, 0);
      node.parameters.get("outputA")!.setValueAtTime(outputA, barStartTime);
      node.parameters.get("outputB")!.setValueAtTime(outputB, barStartTime);
    }
  }

  private _cleanupLfos() {
    for (const node of this._lfoNodes.values()) {
      node.disconnect();
    }
    this._lfoNodes.clear();
    this._lfoSchemas.clear();
  }

  // ---------------------------------------------------------------------------
  // Retirement completion
  // ---------------------------------------------------------------------------

  private _finish() {
    if (!this._retired || this._finished || this._scheduled.size > 0) return;
    this._finished = true;
    this._cleanupLfos();
    this._finishedResolve?.();
  }
}

export default Instrument;
export type { ScheduledNote };
