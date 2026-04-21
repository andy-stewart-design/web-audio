import type AudioClock from "@web-audio/clock";
import type {
  EnvelopeSchema,
  ParameterSchema,
  RandomSchema,
} from "@web-audio/schema";
import RandomResolver from "./random-resolver";
import { normalizeADSR } from "./utils/normalize";

const MIN_RAMP = 0.005;

interface ScheduledNote {
  node: AudioScheduledSourceNode;
  gain: GainNode;
  startTime: number;
}

abstract class Instrument {
  protected _ctx: AudioContext;
  protected _clock: AudioClock;
  private _resolvers = new Map<RandomSchema, RandomResolver>();
  private _scheduled: Set<ScheduledNote> = new Set();
  private _onDone: (() => void) | null = null;

  constructor(ctx: AudioContext, clock: AudioClock) {
    this._ctx = ctx;
    this._clock = clock;
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
        note.node.stop(0);
        note.node.disconnect();
        note.gain.disconnect();
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
    };
  }

  protected _scheduleParamEnvelope(
    param: AudioParam,
    envelope: EnvelopeSchema,
    barIndex: number,
    stepIndex: number,
    noteDuration: number,
    endTime: number,
    scale = 1,
  ): number {
    const env = this._resolveEnvelope(envelope, barIndex, stepIndex);
    const { a, d, s, r } = normalizeADSR(env.a, env.d, env.s, env.r, env.mode);

    const min = env.min * scale;
    const max = env.max * scale;
    const sustain = min + (max - min) * s;

    const startTime = endTime - noteDuration;
    const attackDur = Math.max(a * noteDuration, MIN_RAMP);
    const decayDur = Math.max(d * noteDuration, MIN_RAMP);
    const releaseDur = Math.max(r * noteDuration, MIN_RAMP);

    param.setValueAtTime(min, startTime);
    param.linearRampToValueAtTime(max, startTime + attackDur);
    param.linearRampToValueAtTime(sustain, startTime + attackDur + decayDur);
    param.setValueAtTime(sustain, endTime);
    param.linearRampToValueAtTime(min, endTime + releaseDur);

    return releaseDur;
  }

  protected _track(
    node: AudioScheduledSourceNode,
    gain: GainNode,
    startTime: number,
  ): void {
    const scheduled: ScheduledNote = { node, gain, startTime };
    this._scheduled.add(scheduled);

    node.onended = () => {
      node.disconnect();
      gain.disconnect();
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
