import type { EffectSchema } from "@web-audio/schema";
import ParameterManager, {
  type ParameterScheduleContext,
} from "@/automation/parameter-manager";
import { FILTER_TYPE_MAP } from "@/constants";

interface EffectChainOptions {
  ctx: AudioContext;
  input: AudioNode;
  output: AudioNode;
  effects: EffectSchema[];
  parameters: ParameterManager;
  context: ParameterScheduleContext;
  cleanups: (() => void)[];
}

function unsupportedEffect(effect: never): never {
  throw new Error(`Unsupported effect type: ${JSON.stringify(effect)}`);
}

function buildEffectChain({
  ctx,
  input,
  output,
  effects,
  parameters,
  context,
  cleanups,
}: EffectChainOptions) {
  const nodes = effects.map((effect) => {
    switch (effect.type) {
      case "filter": {
        const node = new BiquadFilterNode(ctx, {
          type: FILTER_TYPE_MAP[effect.filterType],
        });
        for (const [param, schema] of [
          [node.frequency, effect.frequency],
          [node.Q, effect.q],
          [node.detune, effect.detune],
          [node.gain, effect.gain],
        ] as const) {
          parameters.applyParamSchema(param, schema, context, 1, cleanups);
        }
        return node;
      }
      case "gain": {
        const node = new GainNode(ctx);
        parameters.applyParamSchema(
          node.gain,
          effect.gain,
          context,
          1,
          cleanups,
        );
        return node;
      }
      default:
        return unsupportedEffect(effect);
    }
  });

  let previous = input;
  for (const node of nodes) {
    previous.connect(node);
    previous = node;
  }
  previous.connect(output);

  return nodes;
}

export { buildEffectChain };
export type { EffectChainOptions };
