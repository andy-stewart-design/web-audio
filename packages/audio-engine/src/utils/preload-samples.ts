import type {
  BankSchema,
  SamplerSchema,
  VariationIndexPattern,
} from "@web-audio/schema";
import {
  deriveSourceKeys,
  resolveSample,
  resolveVariationEntry,
} from "./resolve-sample-entry";

const MAX_FINITE_RANDOM_VARIATIONS = 128;

interface SamplePreloadPlan {
  url: string;
  reverse: boolean;
}

function planSamplerPreloads(
  schema: SamplerSchema,
  banks: Record<string, BankSchema>,
) {
  const plans = new Map<string, SamplePreloadPlan>();
  const bank = banks[schema.bank];
  if (!bank) {
    console.warn(`[Sampler] Bank "${schema.bank}" not found in schema`);
    return [];
  }

  for (const sampleName of collectSampleNames(schema)) {
    const sample = resolveSample(banks, schema.bank, sampleName);
    if (!sample) {
      console.warn(
        `[Sampler] Sample "${sampleName}" not found in bank "${schema.bank}"`,
      );
      continue;
    }

    const sourceKeys = deriveSourceKeys(sample);
    if (sourceKeys.length === 0) {
      console.warn(
        `[Sampler] No source keys found for "${schema.bank}/${sampleName}"`,
      );
      continue;
    }

    for (const sourceKey of sourceKeys) {
      const variations = sample[String(sourceKey)];
      if (variations.length === 0) {
        console.warn(
          `[Sampler] No entries found for "${schema.bank}/${sampleName}" source ${sourceKey}`,
        );
        continue;
      }
      const requested = finiteVariationValues(schema.events.variationIndices);
      const entries = requested
        ? requested.map((value) => resolveVariationEntry(variations, value))
        : variations;

      for (const entry of entries) {
        if (!entry) {
          console.warn(
            `[Sampler] No entry found for "${schema.bank}/${sampleName}" source ${sourceKey}`,
          );
          continue;
        }
        plans.set(entry.src, {
          url: entry.src,
          reverse: schema.direction !== "forward",
        });
      }
    }
  }

  return Array.from(plans.values());
}

function collectSampleNames(schema: SamplerSchema) {
  const names = new Set<string>();
  for (const bar of schema.events.sampleNames.cycle) {
    for (const group of bar) {
      group?.forEach((name) => names.add(name));
    }
  }
  return names;
}

function finiteVariationValues(pattern: VariationIndexPattern | undefined) {
  if (!pattern) return [0];
  if (pattern.type === "static") {
    return pattern.cycle.flatMap((bar) => bar.flatMap((group) => group ?? []));
  }
  if (pattern.valueMap) return pattern.valueMap;
  const range = pattern.range;
  if (
    pattern.dataType !== "integer" ||
    pattern.quantValue !== undefined ||
    !range ||
    !Number.isInteger(range.min) ||
    !Number.isInteger(range.max) ||
    range.min > range.max ||
    range.max - range.min > MAX_FINITE_RANDOM_VARIATIONS
  ) {
    return null;
  }

  return Array.from(
    { length: range.max - range.min + 1 },
    (_, index) => range.min + index,
  );
}

export { planSamplerPreloads };
export type { SamplePreloadPlan };
