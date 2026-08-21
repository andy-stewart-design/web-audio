import type { BusSchema, EffectSchema } from "@web-audio/schema";
import { FILTER_TYPE_MAP } from "@/constants";
import { resolveConstantAudioParam } from "./resolve-constant-audio-param";

class RuntimeBus {
  readonly input: GainNode;
  private readonly _effects: AudioNode[];
  private readonly _output: GainNode;
  private _destroyed = false;

  constructor(
    ctx: AudioContext,
    name: string,
    schema: BusSchema,
    destination: AudioNode,
  ) {
    this.input = ctx.createGain();
    this._effects = schema.effects.map((effect, index) =>
      buildEffect(ctx, effect, `Bus "${name}" effects[${index}]`),
    );
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

function buildEffect(ctx: AudioContext, effect: EffectSchema, path: string) {
  if (effect.type === "filter") {
    const node = new BiquadFilterNode(ctx, {
      type: FILTER_TYPE_MAP[effect.filterType],
    });
    node.frequency.value = resolveConstantAudioParam(
      effect.frequency,
      `${path}.frequency`,
    );
    node.Q.value = resolveConstantAudioParam(effect.q, `${path}.q`);
    node.detune.value = resolveConstantAudioParam(
      effect.detune,
      `${path}.detune`,
    );
    node.gain.value = resolveConstantAudioParam(effect.gain, `${path}.gain`);
    return node;
  }

  const node = new GainNode(ctx);
  node.gain.value = resolveConstantAudioParam(effect.gain, `${path}.gain`);
  return node;
}

export default RuntimeBus;
