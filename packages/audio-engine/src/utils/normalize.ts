interface NormalizedADSR {
  a: number;
  d: number;
  s: number;
  r: number;
}

function normalizeADSR(
  a: number,
  d: number,
  s: number,
  r: number,
  mode: "bleed" | "clip",
): NormalizedADSR {
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

  return { a, d, s, r };
}

export { normalizeADSR };
export type { NormalizedADSR };
