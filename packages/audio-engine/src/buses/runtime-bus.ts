import { isConstantAudioParamSchema } from "@web-audio/schema";
import type {
  AudioParamSchema,
  BusSchema,
  EffectSchema,
} from "@web-audio/schema";
import { FILTER_TYPE_MAP } from "@/constants";

class RuntimeBus {
  readonly input: GainNode;
  private readonly _effects: AudioNode[];
  private readonly _output: GainNode;
  private _destroyed = false;

  constructor(ctx: AudioContext, schema: BusSchema, destination: AudioNode) {
    this.input = ctx.createGain();
    this._effects = schema.effects.map((effect) => buildEffect(ctx, effect));
    this._output = ctx.createGain();
    this._output.gain.value = schema.gain;

    let previous: AudioNode = this.input;
    for (const effect of this._effects) {
      previous.connect(effect);
      previous = effect;
    }
    previous.connect(this._output);
    this._output.connect(destination);
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this.input.disconnect();
    this._effects.forEach((effect) => effect.disconnect());
    this._output.disconnect();
  }
}

function buildEffect(ctx: AudioContext, effect: EffectSchema) {
  if (effect.type === "filter") {
    const node = new BiquadFilterNode(ctx, {
      type: FILTER_TYPE_MAP[effect.filterType],
    });
    node.frequency.value = constantValue(effect.frequency);
    node.Q.value = constantValue(effect.q);
    node.detune.value = constantValue(effect.detune);
    node.gain.value = constantValue(effect.gain);
    return node;
  }

  const node = new GainNode(ctx);
  node.gain.value = constantValue(effect.gain);
  return node;
}

function constantValue(schema: AudioParamSchema) {
  if (!isConstantAudioParamSchema(schema)) {
    throw new Error("[RuntimeBus] Expected a validated constant parameter.");
  }
  return schema.cycle[0][0].value;
}

export default RuntimeBus;
