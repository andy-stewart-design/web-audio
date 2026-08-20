import type { AudioParamSchema, EffectSchema } from "@web-audio/schema";
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
  applyParameter?: (param: AudioParam, schema: AudioParamSchema) => void;
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
  applyParameter,
}: EffectChainOptions) {
  function apply(param: AudioParam, schema: AudioParamSchema) {
    if (applyParameter) {
      applyParameter(param, schema);
    } else {
      parameters.applyParamSchema(param, schema, context, 1, cleanups);
    }
  }
  const nodes: AudioNode[] = [];
  try {
    for (const effect of effects) {
      switch (effect.type) {
        case "filter": {
          const node = new BiquadFilterNode(ctx, {
            type: FILTER_TYPE_MAP[effect.filterType],
          });
          nodes.push(node);
          for (const [param, schema] of [
            [node.frequency, effect.frequency],
            [node.Q, effect.q],
            [node.detune, effect.detune],
            [node.gain, effect.gain],
          ] as const) {
            apply(param, schema);
          }
          break;
        }
        case "gain": {
          const node = new GainNode(ctx);
          nodes.push(node);
          apply(node.gain, effect.gain);
          break;
        }
        default:
          unsupportedEffect(effect);
      }
    }

    let previous = input;
    for (const node of nodes) {
      previous.connect(node);
      previous = node;
    }
    previous.connect(output);
    return nodes;
  } catch (error) {
    for (const node of nodes) node.disconnect();
    throw error;
  }
}

export { buildEffectChain };
export type { EffectChainOptions };
