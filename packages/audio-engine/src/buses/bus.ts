import type AudioClock from "@web-audio/clock";
import type { Midi } from "@web-audio/midi";
import type {
  AudioParamSchema,
  BusSchema,
  EffectSchema,
  EnvelopeSchema,
} from "@web-audio/schema";
import ParameterManager, {
  type ParameterScheduleContext,
} from "@/automation/parameter-manager";
import { buildEffectChain } from "@/effects/effect-chain";
import { MIN_RAMP } from "@/constants";
import { computeBusEnvelope } from "@/utils/compute-bus-envelope";

interface BusOptions {
  schema: BusSchema;
  destination: AudioNode;
  startingBar?: number;
  barStartTime?: number;
}

interface PersistentParameter {
  param: AudioParam;
  schema: AudioParamSchema;
}

function getEffectParameters(effects: EffectSchema[]) {
  const parameters: AudioParamSchema[] = [];
  for (const effect of effects) {
    if (effect.type === "filter") {
      parameters.push(effect.frequency, effect.q, effect.detune, effect.gain);
    } else {
      parameters.push(effect.gain);
    }
  }
  return parameters;
}

class Bus {
  readonly input: GainNode;
  private _ctx: AudioContext;
  private _clock: AudioClock;
  private _parameters: ParameterManager;
  private _effectNodes: AudioNode[];
  private _duckNode: GainNode;
  private _outputNode: GainNode;
  private _persistentParameters: PersistentParameter[] = [];
  private _cleanups: (() => void)[] = [];
  private _destroyed = false;

  constructor(
    ctx: AudioContext,
    clock: AudioClock,
    {
      schema,
      destination,
      startingBar = 0,
      barStartTime = ctx.currentTime,
    }: BusOptions,
  ) {
    this._ctx = ctx;
    this._clock = clock;
    this._parameters = new ParameterManager(ctx, clock);
    this.input = ctx.createGain();
    this._duckNode = ctx.createGain();
    this._outputNode = ctx.createGain();
    this._duckNode.gain.value = 1;
    this._outputNode.gain.value = schema.gain;

    const schemas = getEffectParameters(schema.effects);
    this._parameters.initializeLfos(schemas, startingBar, barStartTime);
    const context = this._context(startingBar, barStartTime);
    this._effectNodes = buildEffectChain({
      ctx,
      input: this.input,
      output: this._duckNode,
      effects: schema.effects,
      parameters: this._parameters,
      context,
      cleanups: this._cleanups,
      applyParameter: (param, parameterSchema) => {
        this._persistentParameters.push({ param, schema: parameterSchema });
        this._applyPersistentParameter(param, parameterSchema, context);
      },
    });
    this._duckNode.connect(this._outputNode);
    this._outputNode.connect(destination);
  }

  scheduleBar(barIndex: number, barStartTime: number) {
    if (this._destroyed) return;
    const context = this._context(barIndex, barStartTime);
    this._parameters.updateLfoParams(barIndex, barStartTime);
    for (const { param, schema } of this._persistentParameters) {
      if (schema.type === "lfo" || schema.type === "midi-cc") continue;
      this._schedulePersistentParameter(param, schema, context);
    }
  }

  connectMidi(midi: Midi) {
    if (this._destroyed) return;
    this._parameters.connectMidi(midi);
  }

  disconnectMidi() {
    this._parameters.disconnectMidi();
  }

  stop() {
    if (this._destroyed) return;
    const now = this._ctx.currentTime;
    for (const { param, schema } of this._persistentParameters) {
      if (schema.type === "lfo" || schema.type === "midi-cc") continue;
      if (schema.type === "envelope") {
        param.cancelAndHoldAtTime(now);
        param.linearRampToValueAtTime(schema.min, now + MIN_RAMP);
      } else {
        param.cancelScheduledValues(now);
      }
    }
    this._parameters.cancelFutureLfoUpdates(now);
    this._duckNode.gain.cancelAndHoldAtTime(now);
    this._duckNode.gain.exponentialRampToValueAtTime(1, now + MIN_RAMP);
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    for (const cleanup of this._cleanups) cleanup();
    this._cleanups = [];
    this._parameters.destroy();
    this.input.disconnect();
    for (const node of this._effectNodes) node.disconnect();
    this._duckNode.disconnect();
    this._outputNode.disconnect();
    this._persistentParameters = [];
  }

  private _context(barIndex: number, barStartTime: number) {
    return {
      barIndex,
      stepIndex: 0,
      startTime: barStartTime,
      duration: this._clock.barDuration,
      endTime: barStartTime + this._clock.barDuration,
    } satisfies ParameterScheduleContext;
  }

  private _applyPersistentParameter(
    param: AudioParam,
    schema: AudioParamSchema,
    context: ParameterScheduleContext,
  ) {
    if (schema.type === "lfo" || schema.type === "midi-cc") {
      this._parameters.applyParamSchema(
        param,
        schema,
        context,
        1,
        this._cleanups,
      );
      return;
    }
    if (schema.type === "envelope") {
      param.value = schema.min;
      this._scheduleEnvelope(param, schema, context);
      return;
    }
    const value = this._parameters.resolve(
      schema,
      context.barIndex,
      context.stepIndex,
    );
    param.value = value;
    param.setValueAtTime(value, context.startTime);
  }

  private _schedulePersistentParameter(
    param: AudioParam,
    schema: Exclude<AudioParamSchema, { type: "lfo" | "midi-cc" }>,
    context: ParameterScheduleContext,
  ) {
    if (schema.type === "envelope") {
      this._scheduleEnvelope(param, schema, context);
      return;
    }
    param.setValueAtTime(
      this._parameters.resolve(schema, context.barIndex, context.stepIndex),
      context.startTime,
    );
  }

  private _scheduleEnvelope(
    param: AudioParam,
    schema: EnvelopeSchema,
    context: ParameterScheduleContext,
  ) {
    const envelope = computeBusEnvelope(
      this._parameters.resolveEnvelope(schema, context),
      context.startTime,
      context.duration,
    );
    param.cancelScheduledValues(context.startTime);
    param.setValueAtTime(envelope.min, envelope.startTime);
    param.linearRampToValueAtTime(envelope.max, envelope.attackEnd);
    param.linearRampToValueAtTime(envelope.sustain, envelope.decayEnd);
    param.setValueAtTime(envelope.sustain, envelope.releaseStart);
    param.linearRampToValueAtTime(envelope.min, envelope.endTime);
  }
}

export default Bus;
