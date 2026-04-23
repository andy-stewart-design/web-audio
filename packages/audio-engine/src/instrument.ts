import type AudioClock from "@web-audio/clock";
import type {
  EnvelopeSchema,
  ParameterSchema,
  RandomSchema,
} from "@web-audio/schema";
import RandomResolver from "./random-resolver";
import { computeEnvelope } from "./utils/compute-envelope";
import type { ScheduledNote, ResolvedEnvelopeSchema } from "./types";

const MIN_RAMP = 0.005;
const BASE_GAIN = 0.25;

abstract class Instrument {
  protected _ctx: AudioContext;
  protected _clock: AudioClock;
  protected readonly _outputNode: GainNode;
  private _resolvers = new Map<RandomSchema, RandomResolver>();
  private _scheduled: Set<ScheduledNote> = new Set();
  private _onDone: (() => void) | null = null;

  constructor(ctx: AudioContext, clock: AudioClock) {
    this._ctx = ctx;
    this._clock = clock;
    this._outputNode = ctx.createGain();
    this._outputNode.gain.value = BASE_GAIN;
    this._outputNode.connect(ctx.destination);
  }

  abstract scheduleBar(barIndex: number, barStartTime: number): void;

  whenDone(cb: () => void): void {
    if (this._scheduled.size === 0) {
      cb();
      return;
    }
    this._onDone = cb;
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
      if (this._scheduled.size === 0 && this._onDone) {
        this._onDone();
        this._onDone = null;
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
export { MIN_RAMP };
export type { ScheduledNote };
