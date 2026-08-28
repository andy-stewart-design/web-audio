import type {
  AudioParamSchema,
  BusSchema,
  EffectSchema,
  ParameterSchema,
  RandomSchema,
} from "@web-audio/schema";
import { FILTER_TYPE_MAP, MIN_RAMP } from "@/constants";
import RandomResolver from "@/resolvers/random-resolver";

interface BusParameterBinding {
  target: AudioParam;
  schema: ParameterSchema;
  value: number | undefined;
}

interface RuntimeEffect {
  node: AudioNode;
  bindings: BusParameterBinding[];
}

interface RuntimeBusOptions {
  startingBar: number;
  barStartTime: number | undefined;
}

class RuntimeBus {
  readonly input: GainNode;
  private readonly _ctx: AudioContext;
  private readonly _effects: RuntimeEffect[];
  private readonly _output: GainNode;
  private readonly _randomResolvers = new Map<RandomSchema, RandomResolver>();
  private _lastSchedule: { barIndex: number; startTime: number } | null = null;
  private _destroyed = false;

  constructor(
    ctx: AudioContext,
    schema: BusSchema,
    destination: AudioNode,
    options: RuntimeBusOptions = {
      startingBar: 0,
      barStartTime: undefined,
    },
  ) {
    this._ctx = ctx;
    this.input = ctx.createGain();
    this._effects = schema.effects.map((effect) => buildEffect(ctx, effect));
    this._output = ctx.createGain();
    this._output.gain.value = schema.gain;

    let previous: AudioNode = this.input;
    for (const effect of this._effects) {
      previous.connect(effect.node);
      previous = effect.node;
    }
    previous.connect(this._output);
    this._output.connect(destination);

    this.scheduleBar(options.startingBar, options.barStartTime);
  }

  scheduleBar(barIndex: number, startTime?: number) {
    if (
      startTime !== undefined &&
      this._lastSchedule?.barIndex === barIndex &&
      this._lastSchedule.startTime === startTime
    ) {
      return;
    }

    const resolved = this._effects.flatMap(({ bindings }) =>
      bindings.map((binding) => ({
        binding,
        nextValue: resolveValue(
          binding.schema,
          barIndex,
          this._randomResolvers,
        ),
      })),
    );

    resolved.forEach(({ binding, nextValue }) => {
      const { target, value: previousValue } = binding;
      if (startTime === undefined || previousValue === undefined) {
        if (startTime === undefined) {
          target.value = nextValue;
        } else {
          target.setValueAtTime(nextValue, startTime);
        }
      } else if (previousValue !== nextValue) {
        const rampStart = Math.max(this._ctx.currentTime, startTime);
        const rampEnd = rampStart + MIN_RAMP * 4;
        target.setValueAtTime(previousValue, rampStart);
        target.linearRampToValueAtTime(nextValue, rampEnd);
      }
      binding.value = nextValue;
    });

    this._lastSchedule =
      startTime === undefined ? null : { barIndex, startTime };
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this.input.disconnect();
    this._effects.forEach((effect) => effect.node.disconnect());
    this._output.disconnect();
  }
}

function buildEffect(ctx: AudioContext, effect: EffectSchema) {
  if (effect.type === "filter") {
    const node = new BiquadFilterNode(ctx, {
      type: FILTER_TYPE_MAP[effect.filterType],
    });
    return {
      node,
      bindings: [
        binding(node.frequency, effect.frequency),
        binding(node.Q, effect.q),
        binding(node.detune, effect.detune),
        binding(node.gain, effect.gain),
      ],
    };
  }

  const node = new GainNode(ctx);
  return {
    node,
    bindings: [binding(node.gain, effect.gain)],
  };
}

function binding(target: AudioParam, schema: AudioParamSchema) {
  if (schema.type !== "static" && schema.type !== "random") {
    throw new Error("[RuntimeBus] Expected a validated bus parameter.");
  }
  return { target, schema, value: undefined };
}

function resolveValue(
  schema: ParameterSchema,
  barIndex: number,
  randomResolvers: Map<RandomSchema, RandomResolver>,
) {
  const value =
    schema.type === "random"
      ? randomResolver(schema, randomResolvers).resolve(barIndex, 0)
      : schema.cycle[barIndex % schema.cycle.length]?.[0]?.value;
  if (!Number.isFinite(value)) {
    throw new Error("[RuntimeBus] Expected a validated bus parameter.");
  }
  return value;
}

function randomResolver(
  schema: RandomSchema,
  resolvers: Map<RandomSchema, RandomResolver>,
) {
  let resolver = resolvers.get(schema);
  if (!resolver) {
    resolver = new RandomResolver(schema);
    resolvers.set(schema, resolver);
  }
  return resolver;
}

export default RuntimeBus;
