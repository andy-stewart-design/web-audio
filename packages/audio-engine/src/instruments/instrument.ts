import type { Midi } from "@web-audio/midi";
import type {
  AudioParamSchema,
  DuckSchema,
  EffectSchema,
  EnvelopeSchema,
  EventPattern,
  InstrumentSchema,
  LfoSchema,
  MidiCcSchema,
  NoiseLayerSchema,
  NumberPattern,
} from "@web-audio/schema";
import type { DuckTrigger } from "../buses/duck-automation";
import type { EventScheduleContext } from "../events/types";
import type { InstrumentClock, ScheduledNote } from "./types";
import type {
  ResolvedDetune,
  ResolvedEnvelopeSchema,
} from "../parameters/types";
import type { ScheduledSource, ScheduledVoiceSource } from "../sources/types";
import ValuePatternResolver from "@/patterns/value-pattern-resolver";
import { SYNTH_BASE_GAIN, FILTER_TYPE_MAP } from "@/constants";
import NoiseSource from "../sources/noise-source";
import { toAudioFrame } from "../sources/supersaw-source";
import { computeEnvelope } from "@/parameters/compute-envelope";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

const MAX_AUDIO_PARAM_VALUE = 3.4028234663852886e38;

function safeAudioParamValue(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.max(
    -MAX_AUDIO_PARAM_VALUE,
    Math.min(MAX_AUDIO_PARAM_VALUE, value),
  );
}

function cleanupSafely(cleanup: () => void) {
  try {
    cleanup();
  } catch (error) {
    console.error("Audio cleanup failed", error);
  }
}

interface InstrumentRouting {
  primary: AudioNode;
  sends: { destination: AudioNode; amount: number }[];
}

interface InstrumentOptions {
  destination?: AudioNode;
  routing?: InstrumentRouting;
  startingBar?: number;
  barStartTime?: number;
  onDuck?: (trigger: DuckTrigger) => void;
}

interface BaseInstrumentOptions extends Pick<
  InstrumentOptions,
  "destination" | "routing" | "onDuck"
> {
  baseGain?: number;
  muted?: boolean;
}

interface BaseScheduleVoiceParams {
  sources: readonly [ScheduledVoiceSource, ...ScheduledVoiceSource[]];
  sub?: {
    source: ScheduledVoiceSource;
    gain: AudioParamSchema;
  };
  event: EventScheduleContext;
  detune?: {
    params: readonly [AudioParam, ...AudioParam[]];
    resolved: ResolvedDetune;
  };
  sourceGain?: AudioParamSchema;
  sourceParams?: { param: AudioParam; schema: AudioParamSchema }[];
  gainEnvelope: ResolvedEnvelopeSchema;
  effects: EffectSchema[];
  noise?: {
    color: NoiseLayerSchema["color"];
    gain: AudioParamSchema;
  };
  stopTime?: number;
}

type MidiBinding = (midi: Midi | null) => void;

// -----------------------------------------------------------------------------
// Main Class
// -----------------------------------------------------------------------------

abstract class Instrument {
  // Dependencies
  protected _ctx: BaseAudioContext;
  protected _clock: InstrumentClock;

  // Output graph
  protected readonly _balancingNode: GainNode;
  protected readonly _muteNode: GainNode;
  private readonly _sendNodes: GainNode[];
  private readonly _onDuck?: (trigger: DuckTrigger) => void;

  // Voice state
  private _scheduled: Set<ScheduledNote> = new Set();
  protected readonly _valuePatternResolver = new ValuePatternResolver();

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
    ctx: BaseAudioContext,
    clock: InstrumentClock,
    {
      destination = ctx.destination,
      routing,
      baseGain = SYNTH_BASE_GAIN,
      muted = false,
      onDuck,
    }: BaseInstrumentOptions = {},
  ) {
    this._ctx = ctx;
    this._clock = clock;
    this._onDuck = onDuck;
    this._balancingNode = ctx.createGain();
    this._muteNode = ctx.createGain();
    this._balancingNode.gain.value = safeAudioParamValue(baseGain);
    this._muteNode.gain.value = muted ? 0 : 1;
    this._balancingNode.connect(this._muteNode);
    this._muteNode.connect(routing?.primary ?? destination);
    this._sendNodes = (routing?.sends ?? []).map((send) => {
      const node = ctx.createGain();
      node.gain.value = safeAudioParamValue(send.amount);
      this._muteNode.connect(node);
      node.connect(send.destination);
      return node;
    });
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
    this._releaseMidi();
  }

  cancelFutureNotes() {
    const now = this._ctx.currentTime;
    for (const note of this._scheduled) {
      if (note.startTime <= now) continue;
      this._releaseScheduledNote(note);
    }
    this._finish();
  }

  retire() {
    if (this._retired || this._destroyed) return;
    this._retired = true;
    this._releaseMidi();
    this._finish();
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this._releaseMidi();
    this._midiBindings.clear();

    for (const note of this._scheduled) this._releaseScheduledNote(note);

    this._cleanupLfos();
    cleanupSafely(() => this._balancingNode.disconnect());
    cleanupSafely(() => this._muteNode.disconnect());
    this._sendNodes.forEach((node) => cleanupSafely(() => node.disconnect()));
    this._finished = true;
    this._finishedResolve?.();
  }

  // ---------------------------------------------------------------------------
  // Voice scheduling
  // ---------------------------------------------------------------------------

  protected _emitDuckTriggers(
    ducks: Record<string, DuckSchema>,
    startTime: number,
    duration: number,
  ) {
    if (!this._onDuck || this._destroyed) return;
    for (const [target, duck] of Object.entries(ducks)) {
      this._onDuck({
        target,
        depth: duck.depth,
        onset: duck.onset,
        recovery: duck.recovery,
        duration,
        startTime,
      });
    }
  }

  protected _scheduleVoice(params: BaseScheduleVoiceParams) {
    const { event, detune, gainEnvelope, effects } = params;
    const mainSourceNodes = params.sources.map(({ node }) => node);
    const sourceNodes = [
      ...mainSourceNodes,
      ...(params.sub ? [params.sub.source.node] : []),
    ];
    const scheduled = this._createScheduledNote(sourceNodes, event.startTime);
    const ownNode = (node: AudioNode) => scheduled.audioNodes.add(node);
    let noiseSource: NoiseSource | undefined;

    try {
      if (params.noise) {
        const stopTime =
          params.stopTime ?? this._resolveVoiceStopTime(gainEnvelope, event);
        noiseSource = new NoiseSource(this._ctx, {
          color: params.noise.color,
          seed: 0,
          startFrame: toAudioFrame(this._ctx, event.startTime),
          stopFrame: toAudioFrame(this._ctx, stopTime),
        });
        scheduled.sourceNodes.push(noiseSource);
      }

      const gain = new GainNode(this._ctx);
      ownNode(gain);
      this._scheduleParamEnvelope(gain.gain, gainEnvelope, event);

      let mainGain: GainNode | undefined;
      if (params.sourceGain) {
        mainGain = new GainNode(this._ctx);
        ownNode(mainGain);
        this._applySourceGain(
          mainGain.gain,
          params.sourceGain,
          event,
          scheduled.completionCleanups,
        );
      }

      let subGain: GainNode | undefined;
      if (params.sub) {
        subGain = new GainNode(this._ctx);
        ownNode(subGain);
        this._applySourceGain(
          subGain.gain,
          params.sub.gain,
          event,
          scheduled.completionCleanups,
        );
      }

      let noiseGain: GainNode | undefined;
      if (params.noise && noiseSource) {
        noiseGain = new GainNode(this._ctx);
        ownNode(noiseGain);
        this._applyParamSchema(
          noiseGain.gain,
          params.noise.gain,
          event,
          1,
          scheduled.completionCleanups,
        );
      }

      if (detune) {
        const resolved = detune.resolved;
        if (resolved.type === "envelope") {
          detune.params.forEach((param) =>
            this._scheduleParamEnvelope(param, resolved.envelope, event),
          );
        } else if (resolved.type === "lfo") {
          detune.params.forEach((param) =>
            this._connectLfo(
              param,
              resolved.schema,
              scheduled.completionCleanups,
            ),
          );
        } else if (resolved.type === "midi-cc") {
          scheduled.completionCleanups.push(
            this._bindMidiParams(detune.params, resolved.schema, 1),
          );
        }
      }

      params.sourceParams?.forEach(({ param, schema }) => {
        this._applyParamSchema(
          param,
          schema,
          event,
          1,
          scheduled.completionCleanups,
        );
      });

      const effectNodes = effects.map((effect) =>
        this._buildEffectNode(
          effect,
          event,
          scheduled.completionCleanups,
          ownNode,
        ),
      );
      const chain: AudioNode[] = [...effectNodes, gain];
      const sourceDestination = mainGain ?? chain[0]!;
      mainSourceNodes.forEach((source) => source.connect(sourceDestination));
      if (mainGain) mainGain.connect(chain[0]!);
      if (params.sub && subGain) {
        params.sub.source.node.connect(subGain);
        subGain.connect(chain[0]!);
      }
      if (noiseSource && noiseGain) {
        noiseSource.connect(noiseGain);
        noiseGain.connect(chain[0]);
      }
      chain.reduce((src, dst) => {
        src.connect(dst);
        return dst;
      });

      chain[chain.length - 1].connect(this._balancingNode);

      this._track(scheduled);
      for (const { node, offset } of [
        ...params.sources,
        ...(params.sub ? [params.sub.source] : []),
      ]) {
        if (scheduled.released) break;
        if (offset === undefined) node.start(event.startTime);
        else node.start(event.startTime, offset);
        if (!scheduled.released) scheduled.startedSourceNodes.add(node);
      }
      if (noiseSource && !scheduled.released) {
        noiseSource.start(event.startTime);
        if (!scheduled.released) scheduled.startedSourceNodes.add(noiseSource);
      }
      for (const source of scheduled.sourceNodes) {
        if (scheduled.released || scheduled.endedSourceNodes.has(source))
          continue;
        source.stop(
          params.stopTime ?? this._resolveVoiceStopTime(gainEnvelope, event),
        );
      }
    } catch (error) {
      this._releaseScheduledNote(scheduled);
      this._finish();
      throw error;
    }
  }

  protected _buildEffectNode(
    effect: EffectSchema,
    event: EventScheduleContext,
    completionCleanups: (() => void)[],
    ownNode: (node: AudioNode) => void,
  ) {
    switch (effect.type) {
      case "filter": {
        const node = new BiquadFilterNode(this._ctx, {
          type: FILTER_TYPE_MAP[effect.filterType],
        });
        ownNode(node);
        for (const [param, schema] of [
          [node.frequency, effect.frequency],
          [node.Q, effect.q],
          [node.detune, effect.detune],
          [node.gain, effect.gain],
        ] as const) {
          this._applyParamSchema(param, schema, event, 1, completionCleanups);
        }
        return node;
      }
      case "gain": {
        const node = new GainNode(this._ctx);
        ownNode(node);
        this._applyParamSchema(
          node.gain,
          effect.gain,
          event,
          1,
          completionCleanups,
        );
        return node;
      }
    }
  }

  protected _createScheduledNote(
    sourceNodes: readonly ScheduledSource[],
    startTime: number,
  ) {
    if (sourceNodes.length === 0)
      throw new Error("A scheduled voice requires at least one source.");

    const scheduled: ScheduledNote = {
      sourceNodes: [...sourceNodes],
      startedSourceNodes: new Set(),
      endedSourceNodes: new Set(),
      disconnectedSourceNodes: new Set(),
      audioNodes: new Set(),
      completionCleanups: [],
      startTime,
      released: false,
    };
    this._scheduled.add(scheduled);
    return scheduled;
  }

  protected _track(scheduled: ScheduledNote) {
    for (const sourceNode of scheduled.sourceNodes) {
      sourceNode.onended = () => {
        if (scheduled.released || scheduled.endedSourceNodes.has(sourceNode))
          return;
        scheduled.endedSourceNodes.add(sourceNode);
        this._releaseScheduledNote(
          scheduled,
          scheduled.endedSourceNodes.size === scheduled.sourceNodes.length,
        );
        if (scheduled.endedSourceNodes.size === scheduled.sourceNodes.length)
          this._finish();
      };
    }
  }

  private _releaseScheduledNote(note: ScheduledNote, finalize = true) {
    if (note.released) return;

    for (const source of note.sourceNodes) {
      if (
        !note.endedSourceNodes.has(source) ||
        note.disconnectedSourceNodes.has(source)
      )
        continue;
      source.onended = null;
      note.disconnectedSourceNodes.add(source);
      cleanupSafely(() => source.disconnect());
    }

    if (!finalize) return;

    note.released = true;
    this._scheduled.delete(note);
    for (const source of note.sourceNodes) source.onended = null;
    for (const cleanup of note.completionCleanups) cleanupSafely(cleanup);
    for (const source of note.sourceNodes) {
      if (!note.endedSourceNodes.has(source))
        cleanupSafely(() => source.stop(0));
      if (!note.disconnectedSourceNodes.has(source)) {
        note.disconnectedSourceNodes.add(source);
        cleanupSafely(() => source.disconnect());
      }
    }
    for (const node of note.audioNodes) cleanupSafely(() => node.disconnect());
  }

  // ---------------------------------------------------------------------------
  // Parameter resolution and automation
  // ---------------------------------------------------------------------------

  private _applySourceGain(
    param: AudioParam,
    schema: AudioParamSchema,
    event: EventScheduleContext,
    completionCleanups: (() => void)[],
  ) {
    if (schema.type === "static") {
      param.setValueAtTime(
        safeAudioParamValue(
          Math.max(
            0,
            this._resolveValue(schema, event.barIndex, event.hitIndex),
          ),
        ),
        event.startTime,
      );
      return;
    }
    this._applyParamSchema(param, schema, event, 1, completionCleanups);
  }

  protected _applyParamSchema(
    param: AudioParam,
    schema: AudioParamSchema,
    event: EventScheduleContext,
    scale = 1,
    completionCleanups: (() => void)[] = [],
  ) {
    if (schema.type === "midi-cc") {
      completionCleanups.push(this._bindMidiParams([param], schema, scale));
    } else if (schema.type === "lfo") {
      this._connectLfo(param, schema, completionCleanups);
    } else if (schema.type === "envelope") {
      this._scheduleParamEnvelope(
        param,
        this._resolveEnvelope(schema, event),
        event,
        scale,
      );
    } else {
      param.setValueAtTime(
        safeAudioParamValue(
          this._resolveValue(schema, event.barIndex, event.hitIndex) * scale,
        ),
        event.startTime,
      );
    }
  }

  protected _connectLfo(
    param: AudioParam,
    schema: LfoSchema,
    completionCleanups: (() => void)[],
  ) {
    const node = this._lfoNodes.get(schema.id);
    if (!node) return;

    // AudioParam inputs are summed with the intrinsic value. The LFO emits the
    // complete target value, so leave no native-default offset in that sum.
    param.value = 0;
    node.connect(param);
    let connected = true;
    completionCleanups.push(() => {
      if (!connected) return;
      connected = false;
      node.disconnect(param);
    });
  }

  protected _resolveDetune(
    schema: AudioParamSchema,
    event: EventScheduleContext,
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
      case "envelope": {
        const envelope = this._resolveEnvelope(schema, event);
        return {
          type: "envelope",
          schema,
          value: envelope.min,
          envelope,
        } satisfies ResolvedDetune;
      }
      default:
        value = this._resolveValue(schema, event.barIndex, event.hitIndex);
        return { type: "static", value } satisfies ResolvedDetune;
    }
  }

  protected _resolveEnvelope(
    envelope: EnvelopeSchema,
    event: EventScheduleContext,
  ) {
    return {
      min: this._resolveValue(envelope.min, event.barIndex, event.hitIndex),
      max: this._resolveValue(envelope.max, event.barIndex, event.hitIndex),
      a: this._resolveValue(envelope.a, event.barIndex, event.hitIndex),
      d: this._resolveValue(envelope.d, event.barIndex, event.hitIndex),
      s: this._resolveValue(envelope.s, event.barIndex, event.hitIndex),
      r: this._resolveValue(envelope.r, event.barIndex, event.hitIndex),
      mode: envelope.mode,
    } satisfies ResolvedEnvelopeSchema;
  }

  protected _resolveVoiceStopTime(
    gainEnvelope: ResolvedEnvelopeSchema,
    event: EventScheduleContext,
  ) {
    return (
      event.endTime +
      computeEnvelope(gainEnvelope, event.duration, event.endTime).releaseDur +
      0.05
    );
  }

  protected _scheduleParamEnvelope(
    param: AudioParam,
    envelope: ResolvedEnvelopeSchema,
    event: EventScheduleContext,
    scale = 1,
  ): number {
    const env = computeEnvelope(envelope, event.duration, event.endTime, scale);
    const decay = env.startTime + env.attackDur + env.decayDur;

    param.setValueAtTime(safeAudioParamValue(env.min), env.startTime);
    param.linearRampToValueAtTime(
      safeAudioParamValue(env.max),
      env.startTime + env.attackDur,
    );
    param.linearRampToValueAtTime(safeAudioParamValue(env.sustain), decay);
    param.setValueAtTime(safeAudioParamValue(env.sustain), env.endTime);
    param.linearRampToValueAtTime(
      safeAudioParamValue(env.min),
      env.endTime + env.releaseDur,
    );

    return env.releaseDur;
  }

  protected _resolveValue(
    schema: NumberPattern,
    barIndex: number,
    valueIndex: number,
  ) {
    return this._valuePatternResolver.resolve(schema, barIndex, valueIndex);
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

  private _bindMidiParams(
    params: readonly AudioParam[],
    schema: MidiCcSchema,
    scale: number,
  ) {
    let unsubscribe: (() => void) | null = null;
    params.forEach((param) => {
      param.value = safeAudioParamValue(schema.default * scale);
    });

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
          params.forEach((param) => {
            param.value = safeAudioParamValue(mapped * scale);
          });
          return;
        }
        params.forEach((param) =>
          param.setTargetAtTime(
            safeAudioParamValue(mapped * scale),
            this._ctx.currentTime,
            0.01,
          ),
        );
      });
    });
  }

  private _releaseMidi() {
    if (!this._midi) return;
    this._midi = null;
    this._midiBindings.forEach((bind) => cleanupSafely(() => bind(null)));
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
    schema: InstrumentSchema<EventPattern>,
    startingBar = 0,
    barStartTime?: number,
    additionalParams: AudioParamSchema[] = [],
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
          outputA: safeAudioParamValue(this._resolveValue(lfo.outputA, 0, 0)),
          outputB: safeAudioParamValue(this._resolveValue(lfo.outputB, 0, 0)),
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
    for (const param of additionalParams) {
      if (param.type === "lfo") register(param);
    }
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
      const outputA = this._resolveValue(schema.outputA, barIndex, 0);
      const outputB = this._resolveValue(schema.outputB, barIndex, 0);
      node.parameters
        .get("outputA")!
        .setValueAtTime(safeAudioParamValue(outputA), barStartTime);
      node.parameters
        .get("outputB")!
        .setValueAtTime(safeAudioParamValue(outputB), barStartTime);
    }
  }

  private _cleanupLfos() {
    for (const node of this._lfoNodes.values())
      cleanupSafely(() => node.disconnect());
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
export { safeAudioParamValue };
export type {
  InstrumentOptions,
  InstrumentRouting,
  ScheduledNote,
  ScheduledSource,
  ScheduledVoiceSource,
};
