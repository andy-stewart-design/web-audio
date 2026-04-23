import type { NormalizedADSR, ResolvedEnvelopeSchema } from "@/types";

function normalizeADSR({ a, d, s, r, mode }: ResolvedEnvelopeSchema) {
  if (mode === "bleed") {
    const adSum = a + d;
    if (adSum > 1) {
      a = a / adSum;
      d = d / adSum;
    }
    r = Math.min(r, 1);
  } else {
    const adrSum = a + d + r;
    if (adrSum > 1) {
      a = a / adrSum;
      d = d / adrSum;
      r = r / adrSum;
    }
  }

  return { a, d, s, r } satisfies NormalizedADSR;
}

export { normalizeADSR };
