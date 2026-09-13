import type { BankSchema, NormalizedSampleSchema } from "@web-audio/schema";
import { describe, expect, it } from "vitest";
import {
  deriveSourceKeys,
  resolveSample,
  resolveSampleEntry,
  resolveSampleUrl,
  selectNaturalSourceKey,
  selectNearestSourceKey,
} from "./resolve-sample-entry";

const banks = {
  kit: {
    samples: {
      bd: {
        "0": [
          { type: "file" as const, src: "bd-0.wav" },
          { type: "file" as const, src: "bd-1.wav" },
        ],
      },
      sd: {
        "0": [
          { type: "sprite" as const, src: "kit.wav", start: 0.1, end: 0.2 },
        ],
      },
      piano: {
        "72": [{ type: "file" as const, src: "piano-72.wav" }],
        "48": [{ type: "file" as const, src: "piano-48.wav" }],
        "60": [{ type: "file" as const, src: "piano-60.wav" }],
      },
      pitchedSprite: {
        "67": [
          { type: "sprite" as const, src: "piano.wav", start: 0.5, end: 1 },
        ],
        "55": [
          { type: "sprite" as const, src: "piano.wav", start: 0, end: 0.5 },
        ],
      },
    },
  },
} satisfies Record<string, BankSchema>;

describe("sample identity and source keys", () => {
  it("resolves samples by exact bank and canonical sample name", () => {
    expect(resolveSample(banks, "kit", "bd")).toBe(banks.kit.samples.bd);
    expect(resolveSample(banks, "kit", " bd ")).toBeNull();
    expect(resolveSample(banks, "missing", "bd")).toBeNull();
    expect(resolveSample(banks, "kit", "missing")).toBeNull();
  });

  it.each([
    ["simple file", banks.kit.samples.bd, [0]],
    ["sprite", banks.kit.samples.sd, [0]],
    ["multisample", banks.kit.samples.piano, [48, 60, 72]],
    ["pitched sprite", banks.kit.samples.pitchedSprite, [55, 67]],
  ])("derives sorted source keys for a %s", (_label, sample, expected) => {
    expect(deriveSourceKeys(sample)).toEqual(expected);
  });

  it("caches derived keys by normalized sample identity", () => {
    const sample: NormalizedSampleSchema = {
      "60": [{ type: "file", src: "60.wav" }],
      "48": [{ type: "file", src: "48.wav" }],
    };

    const first = deriveSourceKeys(sample);
    sample[72] = [{ type: "file", src: "72.wav" }];

    expect(deriveSourceKeys(sample)).toBe(first);
    expect(first).toEqual([48, 60]);
  });

  it("selects the lowest source key for natural-pitch playback", () => {
    expect(selectNaturalSourceKey([48, 60, 72])).toBe(48);
    expect(selectNaturalSourceKey([])).toBeNull();
  });

  it.each([
    [60, 60],
    [20, 48],
    [90, 72],
    [55, 60],
    [54, 48],
  ])("selects nearest key for requested note %s", (note, expected) => {
    expect(selectNearestSourceKey([48, 60, 72], note)).toBe(expected);
  });

  it("uses the lower key for exact midpoint ties regardless of input order", () => {
    expect(selectNearestSourceKey([60, 48], 54)).toBe(48);
  });

  it("returns null when no source key is available", () => {
    expect(selectNearestSourceKey([], 60)).toBeNull();
  });
});

describe("resolveSampleEntry", () => {
  it("resolves file entries", () => {
    expect(
      resolveSampleEntry({
        banks,
        bank: "kit",
        sample: "bd",
        sourceKey: 0,
        variationIndex: 1,
      }),
    ).toEqual({ type: "file", src: "bd-1.wav" });
  });

  it("resolves sprite entries with logical region metadata", () => {
    expect(
      resolveSampleEntry({
        banks,
        bank: "kit",
        sample: "sd",
        sourceKey: 0,
        variationIndex: 0,
      }),
    ).toEqual({ type: "sprite", src: "kit.wav", start: 0.1, end: 0.2 });
  });

  it("isolates PR 1 rounding and out-of-range fallback", () => {
    expect(
      resolveSampleEntry({
        banks,
        bank: "kit",
        sample: "bd",
        sourceKey: 0,
        variationIndex: 0.6,
      }),
    ).toEqual({ type: "file", src: "bd-1.wav" });
    expect(
      resolveSampleEntry({
        banks,
        bank: "kit",
        sample: "bd",
        sourceKey: 0,
        variationIndex: 99,
      }),
    ).toEqual({ type: "file", src: "bd-0.wav" });
  });

  it("returns null for missing bank, sample, source key, or entry", () => {
    for (const options of [
      { bank: "missing", sample: "bd", sourceKey: 0 },
      { bank: "kit", sample: "missing", sourceKey: 0 },
      { bank: "kit", sample: "bd", sourceKey: 12 },
    ]) {
      expect(
        resolveSampleEntry({ banks, ...options, variationIndex: 0 }),
      ).toBeNull();
    }
  });
});

describe("resolveSampleUrl", () => {
  it("returns the exact resolved entry URL", () => {
    expect(
      resolveSampleUrl({
        banks,
        bank: "kit",
        sample: "bd",
        sourceKey: 0,
        variationIndex: 1,
      }),
    ).toBe("bd-1.wav");
  });
});
