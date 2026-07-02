import type {
  BankSchema,
  SampleVariationSchema,
} from "@web-audio/schema";

interface ResolveSampleEntryOptions {
  banks: Record<string, BankSchema>;
  bank: string;
  sample: string;
  sourceKey: number;
  variationIndex: number;
}

function resolveSampleEntry({
  banks,
  bank,
  sample,
  sourceKey,
  variationIndex,
}: ResolveSampleEntryOptions): SampleVariationSchema | null {
  const variations = banks[bank]?.samples[sample]?.[String(sourceKey)];
  return variations?.[variationIndex] ?? variations?.[0] ?? null;
}

function resolveSampleUrl(options: ResolveSampleEntryOptions) {
  return resolveSampleEntry(options)?.src ?? null;
}

export { resolveSampleEntry, resolveSampleUrl };
export type { ResolveSampleEntryOptions };
