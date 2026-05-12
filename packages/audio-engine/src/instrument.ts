import type AudioClock from "@web-audio/clock";
import type {
  EffectSchema,
  EnvelopeSchema,
  LfoSchema,
  ParameterSchema,
  RandomSchema,
  SynthesizerSchema,
} from "@web-audio/schema";
import RandomResolver from "./random-resolver";
import { BASE_GAIN, FILTER_TYPE_MAP } from "./constants";
import { computeEnvelope } from "./utils/compute-envelope";
import type {
  EnvelopeParams,
  ScheduledNote,
  ResolvedEnvelopeSchema,
} from "./types";

abstract class Instrument {
  protected _ctx: AudioContext;
  protected _clock: AudioClock;
  protected readonly _outputNode: GainNode;
  protected _lfoNodes = new Map<string, AudioWorkletNode>();
  protected _lfoSchemas = new Map<string, LfoSchema>();
  private _resolvers = new Map<RandomSchema, RandomResolver>();
  private _scheduled: Set<ScheduledNote> = new Set();
  private _doneResolve: (() => void) | null = null;
  readonly done: Promise<void>;

  constructor(ctx: AudioContext, clock: AudioClock) {
    this._ctx = ctx;
    this._clock = clock;
    this._outputNode = ctx.createGain();
    this._outputNode.gain.value = BASE_GAIN;
    this._outputNode.connect(ctx.destination);
    this.done = new Promise<void>((resolve) => {
      this._doneResolve = resolve;
    });
  }

  abstract scheduleBar(barIndex: number, barStartTime: number): void;

  protected _initLfos(schema: SynthesizerSchema): void {
    const register = (lfo: LfoSchema) => {
      if (this._lfoNodes.has(lfo.id)) return;
      const node = new AudioWorkletNode(this._ctx, "lfo-processor", {
        parameterData: {
          outputA: this._resolve(lfo.outputA, 0, 0),
          outputB: this._resolve(lfo.outputB, 0, 0),
        },
        processorOptions: {
          waveform: lfo.waveform,
          speed: lfo.speed,
          phase: lfo.phase,
          norm: lfo.norm,
          barDuration: this._clock.barDuration,
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

  protected _connectLfoOrSchedule(
    param: AudioParam,
    schema: ParameterSchema | EnvelopeSchema | LfoSchema,
    barIndex: number,
    stepIndex: number,
    startTime: number,
    noteDuration: number,
    endTime: number,
    scale = 1,
  ): void {
    if (schema.type === "lfo") {
      const node = this._lfoNodes.get(schema.id);
      if (node) node.connect(param);
    } else if (schema.type === "envelope") {
      this._scheduleParamEnvelope(
        param,
        schema,
        barIndex,
        stepIndex,
        noteDuration,
        endTime,
        scale,
      );
    } else {
      param.setValueAtTime(
        this._resolve(schema, barIndex, stepIndex) * scale,
        startTime,
      );
    }
  }

  protected _updateLfoParams(barIndex: number, barStartTime: number): void {
    for (const [id, schema] of this._lfoSchemas) {
      const node = this._lfoNodes.get(id);
      if (!node) continue;
      const outputA = this._resolve(schema.outputA, barIndex, 0);
      const outputB = this._resolve(schema.outputB, barIndex, 0);
      node.parameters.get("outputA")!.setValueAtTime(outputA, barStartTime);
      node.parameters.get("outputB")!.setValueAtTime(outputB, barStartTime);
    }
  }

  private _cleanupLfos(): void {
    for (const node of this._lfoNodes.values()) {
      node.disconnect();
    }
    this._lfoNodes.clear();
    this._lfoSchemas.clear();
  }

  cancelFutureNotes(): void {
    const now = this._ctx.currentTime;
    for (const note of this._scheduled) {
      if (note.startTime > now) {
        note.sourceNode.stop(0);
        note.sourceNode.disconnect();
        for (const n of note.audioNodes) n.disconnect();
        this._scheduled.delete(note);
      }
    }
    if (this._scheduled.size === 0) {
      this._cleanupLfos();
      this._doneResolve?.();
    }
  }

  protected _resolve(
    schema: ParameterSchema,
    barIndex: number,
    stepIndex: number,
  ): number {
    if (schema.type === "random") {
      return this._getResolver(schema).resolve(barIndex, stepIndex);
    }
    const bar = schema.cycle[barIndex % schema.cycle.length];
    return bar[stepIndex % bar.length].value;
  }

  protected _resolveEnvelope(
    envelope: EnvelopeSchema,
    barIndex: number,
    stepIndex: number,
  ) {
    return {
      min: envelope.min,
      max: this._resolve(envelope.max, barIndex, stepIndex),
      a: this._resolve(envelope.a, barIndex, stepIndex),
      d: this._resolve(envelope.d, barIndex, stepIndex),
      s: this._resolve(envelope.s, barIndex, stepIndex),
      r: this._resolve(envelope.r, barIndex, stepIndex),
      mode: envelope.mode,
    } satisfies ResolvedEnvelopeSchema;
  }

  protected _computeTimings(
    envSchema: EnvelopeSchema,
    barIndex: number,
    stepIndex: number,
    noteDuration: number,
    endTime: number,
    scale = 1,
  ): EnvelopeParams {
    const resolved = this._resolveEnvelope(envSchema, barIndex, stepIndex);
    return computeEnvelope(resolved, noteDuration, endTime, scale);
  }

  protected _scheduleParamEnvelope(
    param: AudioParam,
    envSchema: EnvelopeSchema,
    barIndex: number,
    stepIndex: number,
    noteDuration: number,
    endTime: number,
    scale = 1,
  ): number {
    const env = this._computeTimings(
      envSchema,
      barIndex,
      stepIndex,
      noteDuration,
      endTime,
      scale,
    );
    const decay = env.startTime + env.attackDur + env.decayDur;

    param.setValueAtTime(env.min, env.startTime);
    param.linearRampToValueAtTime(env.max, env.startTime + env.attackDur);
    param.linearRampToValueAtTime(env.sustain, decay);
    param.setValueAtTime(env.sustain, env.endTime);
    param.linearRampToValueAtTime(env.min, env.endTime + env.releaseDur);

    return env.releaseDur;
  }

  protected _buildEffectNode(
    effect: EffectSchema,
    barIndex: number,
    stepIndex: number,
    startTime: number,
    noteDuration: number,
    endTime: number,
  ): AudioNode {
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
          this._connectLfoOrSchedule(
            param,
            schema,
            barIndex,
            stepIndex,
            startTime,
            noteDuration,
            endTime,
          );
        }
        return node;
      }
      case "gain": {
        const node = new GainNode(this._ctx);
        this._connectLfoOrSchedule(
          node.gain,
          effect.gain,
          barIndex,
          stepIndex,
          startTime,
          noteDuration,
          endTime,
        );
        return node;
      }
    }
  }

  protected _track(
    sourceNode: AudioScheduledSourceNode,
    audioNodes: AudioNode[],
    startTime: number,
  ) {
    const scheduled: ScheduledNote = { sourceNode, audioNodes, startTime };
    this._scheduled.add(scheduled);

    sourceNode.onended = () => {
      sourceNode.disconnect();
      for (const n of audioNodes) n.disconnect();
      this._scheduled.delete(scheduled);
      if (this._scheduled.size === 0) {
        this._cleanupLfos();
        this._doneResolve?.();
      }
    };
  }

  private _getResolver(schema: RandomSchema): RandomResolver {
    let resolver = this._resolvers.get(schema);
    if (!resolver) {
      resolver = new RandomResolver(schema);
      this._resolvers.set(schema, resolver);
    }
    return resolver;
  }
}

export default Instrument;
export type { ScheduledNote };
