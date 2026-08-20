import type AudioClock from "@web-audio/clock";
import type { Midi } from "@web-audio/midi";
import type {
  AudioParamSchema,
  EnvelopeSchema,
  LfoSchema,
  MidiCcSchema,
  ParameterSchema,
  RandomSchema,
} from "@web-audio/schema";
import RandomResolver from "@/resolvers/random-resolver";
import type { ResolvedDetune, ResolvedEnvelopeSchema } from "@/types";
import { computeEnvelope } from "@/utils/compute-envelope";

interface ParameterScheduleContext {
  barIndex: number;
  stepIndex: number;
  startTime: number;
  duration: number;
  endTime: number;
}

type MidiBinding = (midi: Midi | null) => void;

class ParameterManager {
  private _ctx: AudioContext;
  private _clock: AudioClock;
  private _resolvers = new Map<RandomSchema, RandomResolver>();
  private _lfoNodes = new Map<string, AudioWorkletNode>();
  private _lfoSchemas = new Map<string, LfoSchema>();
  private _midi: Midi | null = null;
  private _midiBindings = new Set<MidiBinding>();
  private _destroyed = false;

  constructor(ctx: AudioContext, clock: AudioClock) {
    this._ctx = ctx;
    this._clock = clock;
  }

  connectMidi(midi: Midi) {
    if (this._destroyed || this._midi === midi) return;
    this._midi = midi;
    this._midiBindings.forEach((bind) => bind(midi));
  }

  disconnectMidi() {
    if (!this._midi) return;
    this._midi = null;
    this._midiBindings.forEach((bind) => bind(null));
  }

  registerMidiBinding(bind: MidiBinding) {
    this._midiBindings.add(bind);
    bind(this._midi);
    return () => {
      if (!this._midiBindings.delete(bind)) return;
      bind(null);
    };
  }

  applyParamSchema(
    param: AudioParam,
    schema: AudioParamSchema,
    context: ParameterScheduleContext,
    scale = 1,
    cleanups: (() => void)[] = [],
  ) {
    if (schema.type === "midi-cc") {
      cleanups.push(this._bindMidiParam(param, schema, scale));
    } else if (schema.type === "lfo") {
      this.connectLfo(param, schema, cleanups);
    } else if (schema.type === "envelope") {
      this.scheduleParamEnvelope(
        param,
        this.resolveEnvelope(schema, context),
        context,
        scale,
      );
    } else {
      param.setValueAtTime(
        this.resolve(schema, context.barIndex, context.stepIndex) * scale,
        context.startTime,
      );
    }
  }

  connectLfo(param: AudioParam, schema: LfoSchema, cleanups: (() => void)[]) {
    const node = this._lfoNodes.get(schema.id);
    if (!node) return;

    param.value = 0;
    node.connect(param);
    let connected = true;
    cleanups.push(() => {
      if (!connected) return;
      connected = false;
      node.disconnect(param);
    });
  }

  resolveDetune(schema: AudioParamSchema, barIndex: number, stepIndex: number) {
    switch (schema.type) {
      case "midi-cc":
        return {
          type: "midi-cc",
          value: schema.default,
          schema,
        } satisfies ResolvedDetune;
      case "lfo":
        return { type: "lfo", schema, value: 0 } satisfies ResolvedDetune;
      case "envelope":
        return {
          type: "envelope",
          schema,
          value: schema.min,
        } satisfies ResolvedDetune;
      default:
        return {
          type: "static",
          value: this.resolve(schema, barIndex, stepIndex),
        } satisfies ResolvedDetune;
    }
  }

  resolveEnvelope(envelope: EnvelopeSchema, context: ParameterScheduleContext) {
    return {
      min: envelope.min,
      max: this.resolve(envelope.max, context.barIndex, context.stepIndex),
      a: this.resolve(envelope.a, context.barIndex, context.stepIndex),
      d: this.resolve(envelope.d, context.barIndex, context.stepIndex),
      s: this.resolve(envelope.s, context.barIndex, context.stepIndex),
      r: this.resolve(envelope.r, context.barIndex, context.stepIndex),
      mode: envelope.mode,
    } satisfies ResolvedEnvelopeSchema;
  }

  scheduleParamEnvelope(
    param: AudioParam,
    envelope: ResolvedEnvelopeSchema,
    context: ParameterScheduleContext,
    scale = 1,
  ) {
    const env = computeEnvelope(
      envelope,
      context.duration,
      context.endTime,
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

  resolve(schema: ParameterSchema, barIndex: number, stepIndex: number) {
    if (schema.type === "random") {
      return this._getResolver(schema).resolve(barIndex, stepIndex);
    }
    const bar = schema.cycle[barIndex % schema.cycle.length];
    return bar[stepIndex % bar.length].value;
  }

  initializeLfos(
    schemas: AudioParamSchema[],
    startingBar = 0,
    barStartTime?: number,
  ) {
    for (const schema of schemas) {
      if (schema.type === "lfo") {
        this._registerLfo(schema, startingBar, barStartTime);
      }
    }
  }

  updateLfoParams(barIndex: number, barStartTime: number) {
    for (const [id, schema] of this._lfoSchemas) {
      const node = this._lfoNodes.get(id);
      if (!node) continue;
      const outputA = this.resolve(schema.outputA, barIndex, 0);
      const outputB = this.resolve(schema.outputB, barIndex, 0);
      node.parameters.get("outputA")?.setValueAtTime(outputA, barStartTime);
      node.parameters.get("outputB")?.setValueAtTime(outputB, barStartTime);
    }
  }

  cancelFutureLfoUpdates(time: number) {
    for (const node of this._lfoNodes.values()) {
      node.parameters.get("outputA")?.cancelScheduledValues(time);
      node.parameters.get("outputB")?.cancelScheduledValues(time);
    }
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this.disconnectMidi();
    this._midiBindings.clear();
    for (const node of this._lfoNodes.values()) node.disconnect();
    this._lfoNodes.clear();
    this._lfoSchemas.clear();
    this._resolvers.clear();
  }

  private _getResolver(schema: RandomSchema) {
    let resolver = this._resolvers.get(schema);
    if (!resolver) {
      resolver = new RandomResolver(schema);
      this._resolvers.set(schema, resolver);
    }
    return resolver;
  }

  private _bindMidiParam(
    param: AudioParam,
    schema: MidiCcSchema,
    scale: number,
  ) {
    let unsubscribe: (() => void) | null = null;
    param.value = schema.default * scale;

    return this.registerMidiBinding((midi) => {
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

  private _registerLfo(
    lfo: LfoSchema,
    startingBar: number,
    barStartTime?: number,
  ) {
    if (this._lfoNodes.has(lfo.id)) return;
    const effectiveBarStart = barStartTime ?? this._ctx.currentTime;
    const barOriginTime =
      effectiveBarStart - startingBar * this._clock.barDuration;
    const outputA = this.resolve(lfo.outputA, startingBar, 0);
    const outputB = this.resolve(lfo.outputB, startingBar, 0);
    const node = new AudioWorkletNode(this._ctx, "lfo-processor", {
      parameterData: {
        outputA,
        outputB,
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
    node.parameters.get("outputA")?.setValueAtTime(outputA, effectiveBarStart);
    node.parameters.get("outputB")?.setValueAtTime(outputB, effectiveBarStart);
    this._lfoNodes.set(lfo.id, node);
    this._lfoSchemas.set(lfo.id, lfo);
  }
}

export default ParameterManager;
export type { ParameterScheduleContext };
