import type {
  BankSchema,
  NormalizedSampleSchema,
  SampleVariationSchema,
} from "@web-audio/schema";

interface ResolveSampleEntryOptions {
  banks: Record<string, BankSchema>;
  bank: string;
  sample: string;
  sourceKey: number;
  variationIndex: number;
}

const sourceKeyCache = new WeakMap<NormalizedSampleSchema, readonly number[]>();

function resolveSample(
  banks: Record<string, BankSchema>,
  bank: string,
  sample: string,
) {
  return banks[bank]?.samples[sample] ?? null;
}

function deriveSourceKeys(sample: NormalizedSampleSchema) {
  let keys = sourceKeyCache.get(sample);
  if (!keys) {
    keys = Object.keys(sample)
      .map(Number)
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    sourceKeyCache.set(sample, keys);
  }
  return keys;
}

function selectNaturalSourceKey(sourceKeys: readonly number[]) {
  return sourceKeys[0] ?? null;
}

function selectNearestSourceKey(
  sourceKeys: readonly number[],
  requestedNote: number,
) {
  if (sourceKeys.length === 0) return null;

  return sourceKeys.reduce((nearest, key) => {
    const distance = Math.abs(key - requestedNote);
    const nearestDistance = Math.abs(nearest - requestedNote);
    return distance < nearestDistance ||
      (distance === nearestDistance && key < nearest)
      ? key
      : nearest;
  });
}

function resolveSampleEntry({
  banks,
  bank,
  sample,
  sourceKey,
  variationIndex,
}: ResolveSampleEntryOptions): SampleVariationSchema | null {
  const variations = resolveSample(banks, bank, sample)?.[String(sourceKey)];
  return resolveVariationEntry(variations, variationIndex);
}

function resolveVariationEntry(
  variations: SampleVariationSchema[] | undefined,
  variationIndex: number,
) {
  const normalizedIndex = normalizeVariationIndex(
    variationIndex,
    variations?.length ?? 0,
  );
  return normalizedIndex === null
    ? null
    : (variations?.[normalizedIndex] ?? null);
}

function normalizeVariationIndex(
  variationIndex: number,
  variationCount: number,
) {
  if (!Number.isFinite(variationIndex) || variationCount <= 0) return null;

  const roundedIndex = Math.round(variationIndex);
  return ((roundedIndex % variationCount) + variationCount) % variationCount;
}

function resolveSampleUrl(options: ResolveSampleEntryOptions) {
  return resolveSampleEntry(options)?.src ?? null;
}

export {
  deriveSourceKeys,
  resolveSample,
  resolveSampleEntry,
  normalizeVariationIndex,
  resolveSampleUrl,
  resolveVariationEntry,
  selectNaturalSourceKey,
  selectNearestSourceKey,
};
export type { ResolveSampleEntryOptions };
