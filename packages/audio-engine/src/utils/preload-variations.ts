import type { ParameterSchema, SamplerSchema } from "@web-audio/schema";

function preloadVariationIndices(schema: SamplerSchema) {
  const { variation } = schema;
  const indices = new Set<number>([Math.round(firstValue(variation))]);

  if (variation.type === "static") {
    variation.cycle.forEach((bar) => {
      bar.forEach((step) => indices.add(Math.round(step.value)));
    });
  } else if (variation.valueMap) {
    variation.valueMap.forEach((value) => indices.add(Math.round(value)));
  } else if (variation.dataType === "integer" && variation.range) {
    for (let i = variation.range.min; i <= variation.range.max; i += 1) {
      indices.add(Math.round(i));
    }
  }

  return Array.from(indices);
}

function firstValue(schema: ParameterSchema): number {
  if (schema.type === "random") return schema.cycle.cycle[0]?.[0]?.value ?? 0;
  return schema.cycle[0]?.[0]?.value ?? 0;
}

export { preloadVariationIndices };
