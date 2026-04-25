import type AudioClock from "@web-audio/clock";
import type {
  EffectSchema,
  EnvelopeSchema,
  ParameterSchema,
  RandomSchema,
} from "@web-audio/schema";
import { isEnvelope } from "@web-audio/schema";
import RandomResolver from "./random-resolver";
import { BASE_GAIN, FILTER_TYPE_MAP } from "./constants";
import { computeEnvelope } from "./utils/compute-envelope";
import type { ScheduledNote, ResolvedEnvelopeSchema } from "./types";

abstract class Instrument {
  protected _ctx: AudioContext;
  protected _clock: AudioClock;
  protected readonly _outputNode: GainNode;
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

  protected _scheduleParamEnvelope(
    param: AudioParam,
    envSchema: EnvelopeSchema,
    barIndex: number,
    stepIndex: number,
    noteDuration: number,
    endTime: number,
    scale = 1,
  ): number {
    const _env = this._resolveEnvelope(envSchema, barIndex, stepIndex);
    const env = computeEnvelope(_env, noteDuration, endTime, scale);
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
          if (isEnvelope(schema)) {
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
