import { describe, expect, it } from "vitest";
import { resolveSampleEntry, resolveSampleUrl } from "./resolve-sample-entry";

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
    },
  },
};

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

  it("resolves sprite entries with metadata", () => {
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

  it("falls back to variation 0", () => {
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

  it("returns null for missing bank/sample/key", () => {
    expect(
      resolveSampleEntry({
        banks,
        bank: "missing",
        sample: "bd",
        sourceKey: 0,
        variationIndex: 0,
      }),
    ).toBeNull();
    expect(
      resolveSampleEntry({
        banks,
        bank: "kit",
        sample: "missing",
        sourceKey: 0,
        variationIndex: 0,
      }),
    ).toBeNull();
    expect(
      resolveSampleEntry({
        banks,
        bank: "kit",
        sample: "bd",
        sourceKey: 12,
        variationIndex: 0,
      }),
    ).toBeNull();
  });
});

describe("resolveSampleUrl", () => {
  it("returns the resolved entry src", () => {
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
