import type { SamplerSchema, VariationIndexPattern } from "@web-audio/schema";

function preloadVariationIndices(schema: SamplerSchema) {
  const variation = schema.events.variationIndices;
  if (!variation) return [0];

  const indices = new Set<number>();
  if (variation.type === "static") {
    variation.cycle.forEach((bar) => {
      bar.forEach((group) => {
        group?.forEach((value) => indices.add(Math.round(value)));
      });
    });
  } else if (variation.valueMap) {
    variation.valueMap.forEach((value) => indices.add(Math.round(value)));
  } else if (variation.dataType === "integer" && variation.range) {
    for (
      let value = variation.range.min;
      value <= variation.range.max;
      value++
    ) {
      indices.add(Math.round(value));
    }
  }

  return indices.size > 0 ? Array.from(indices) : [firstVariation(variation)];
}

function firstVariation(pattern: VariationIndexPattern) {
  if (pattern.type === "random-number") return 0;
  return Math.round(pattern.cycle[0]?.[0]?.[0] ?? 0);
}

export { preloadVariationIndices };
