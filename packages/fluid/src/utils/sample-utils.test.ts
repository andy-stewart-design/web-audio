import { describe, expect, it } from "vitest";
import {
  isMultiSampleBank,
  isBanked,
  isBankedBank,
  isPitchedSpriteSampleBank,
  isSampleBank,
  isSpriteSampleBank,
  normalizeSampleBank,
  resolveBank,
} from "./sample-utils";

describe("sample-utils", () => {
  describe("normalizeSampleBank", () => {
    it("normalizes flat simple sample banks", () => {
      expect(normalizeSampleBank({ bd: ["bd.wav"] })).toEqual({
        samples: {
          bd: {
            "0": [{ type: "file", src: "bd.wav" }],
          },
        },
      });
    });

    it("normalizes named simple sample banks", () => {
      expect(
        normalizeSampleBank({ bank: "drums", samples: { bd: ["bd.wav"] } }),
      ).toEqual({
        samples: {
          bd: {
            "0": [{ type: "file", src: "bd.wav" }],
          },
        },
      });
    });

    it("normalizes simple sample banks with baseUrl", () => {
      expect(
        normalizeSampleBank({
          bank: "drums",
          baseUrl: "https://example.com/samples/",
          samples: {
            bd: ["bd.wav", "https://cdn.example.com/sd.wav"],
          },
        }),
      ).toEqual({
        samples: {
          bd: {
            "0": [
              { type: "file", src: "https://example.com/samples/bd.wav" },
              { type: "file", src: "https://cdn.example.com/sd.wav" },
            ],
          },
        },
      });
    });

    it("normalizes multisample pitch keys", () => {
      expect(
        normalizeSampleBank({
          bank: "acoustic",
          samples: {
            piano: {
              a2: ["a2-a.wav", "a2-b.wav"],
              a3: ["a3.wav"],
            },
          },
        }),
      ).toEqual({
        samples: {
          piano: {
            "45": [
              { type: "file", src: "a2-a.wav" },
              { type: "file", src: "a2-b.wav" },
            ],
            "57": [{ type: "file", src: "a3.wav" }],
          },
        },
      });
    });

    it("normalizes multisample banks with baseUrl", () => {
      expect(
        normalizeSampleBank({
          bank: "acoustic",
          baseUrl: "https://example.com/piano",
          samples: {
            piano: {
              a2: ["a2.wav"],
              a3: ["/a3.wav"],
            },
          },
        }),
      ).toEqual({
        samples: {
          piano: {
            "45": [{ type: "file", src: "https://example.com/piano/a2.wav" }],
            "57": [{ type: "file", src: "https://example.com/piano/a3.wav" }],
          },
        },
      });
    });

    it("normalizes sprite banks", () => {
      expect(
        normalizeSampleBank({
          bank: "op1",
          src: "kit.wav",
          samples: {
            bd: [[0, 0.08]],
            sd: [[0.1, 0.18]],
          },
        }),
      ).toEqual({
        samples: {
          bd: {
            "0": [{ type: "sprite", src: "kit.wav", start: 0, end: 0.08 }],
          },
          sd: {
            "0": [{ type: "sprite", src: "kit.wav", start: 0.1, end: 0.18 }],
          },
        },
      });
    });

    it("normalizes sprite banks with baseUrl", () => {
      expect(
        normalizeSampleBank({
          bank: "op1",
          baseUrl: "https://example.com/sprites/",
          src: "kit.wav",
          samples: { bd: [[0, 0.08]] },
        }),
      ).toEqual({
        samples: {
          bd: {
            "0": [
              {
                type: "sprite",
                src: "https://example.com/sprites/kit.wav",
                start: 0,
                end: 0.08,
              },
            ],
          },
        },
      });
    });

    it("normalizes sprite variations", () => {
      expect(
        normalizeSampleBank({
          src: "kit.wav",
          samples: {
            bd: [
              [0, 0.08],
              [0.42, 0.5],
            ],
          },
        }),
      ).toEqual({
        samples: {
          bd: {
            "0": [
              { type: "sprite", src: "kit.wav", start: 0, end: 0.08 },
              { type: "sprite", src: "kit.wav", start: 0.42, end: 0.5 },
            ],
          },
        },
      });
    });

    it("normalizes pitched sprite banks", () => {
      expect(
        normalizeSampleBank({
          bank: "acoustic",
          src: "piano-sprite.wav",
          samples: {
            piano: {
              a2: [[0, 0.16]],
              a3: [
                [0.2, 0.36],
                [0.37, 0.52],
              ],
            },
          },
        }),
      ).toEqual({
        samples: {
          piano: {
            "45": [
              {
                type: "sprite",
                src: "piano-sprite.wav",
                start: 0,
                end: 0.16,
              },
            ],
            "57": [
              {
                type: "sprite",
                src: "piano-sprite.wav",
                start: 0.2,
                end: 0.36,
              },
              {
                type: "sprite",
                src: "piano-sprite.wav",
                start: 0.37,
                end: 0.52,
              },
            ],
          },
        },
      });
    });

    it("rejects legacy name and sprite properties", () => {
      expect(() =>
        normalizeSampleBank({ name: "drums", samples: { bd: ["bd.wav"] } }),
      ).toThrow(
        "Invalid sample manifest: expected a sample bank, banked sample bank, multisample bank, or sprite bank",
      );
      expect(() =>
        normalizeSampleBank({
          sprite: "kit.wav",
          samples: { bd: [[0, 0.08]] },
        }),
      ).toThrow(
        "Invalid sample manifest: expected a sample bank, banked sample bank, multisample bank, or sprite bank",
      );
    });

    it("throws for invalid pitch keys", () => {
      expect(() =>
        normalizeSampleBank({
          bank: "acoustic",
          samples: { piano: { nope: ["file.wav"] } },
        }),
      ).toThrow('Invalid sample pitch key "nope"');
    });

    it("throws for bare string multisample leaves", () => {
      expect(() =>
        normalizeSampleBank({
          bank: "acoustic",
          samples: { piano: { a2: "file.wav" } },
        }),
      ).toThrow(
        "Invalid sample manifest: expected a sample bank, banked sample bank, multisample bank, or sprite bank",
      );
    });

    it("throws for bare sprite region leaves", () => {
      expect(() =>
        normalizeSampleBank({
          bank: "op1",
          src: "kit.wav",
          samples: { bd: [0, 0.08] },
        }),
      ).toThrow(
        "Invalid sample manifest: expected a sample bank, banked sample bank, multisample bank, or sprite bank",
      );
    });

    it("throws for invalid sprite bounds", () => {
      expect(() =>
        normalizeSampleBank({
          bank: "op1",
          src: "kit.wav",
          samples: { bd: [[0.8, 0.2]] },
        }),
      ).toThrow(
        "Invalid sample manifest: expected a sample bank, banked sample bank, multisample bank, or sprite bank",
      );
    });
  });

  describe("resolveBank", () => {
    it("resolves built-in bank definitions into normalized file entries", () => {
      expect(
        resolveBank({
          basePath: "https://example.com/",
          samples: { bd: ["bd.wav"] },
        }),
      ).toEqual({
        samples: {
          bd: {
            "0": [{ type: "file", src: "https://example.com/bd.wav" }],
          },
        },
      });
    });
  });

  describe("type guards", () => {
    it("detects banked objects", () => {
      expect(isBanked({ bank: "kit" })).toBe(true);
      expect(isBanked({})).toBe(false);
    });

    it("detects simple sample banks", () => {
      expect(isSampleBank({ bd: ["bd.wav"] })).toBe(true);
      expect(isSampleBank({ bd: "bd.wav" })).toBe(false);
    });

    it("detects banked simple sample banks", () => {
      expect(isBankedBank({ bank: "kit", samples: { bd: ["bd.wav"] } })).toBe(
        true,
      );
      expect(isBankedBank({ bank: "kit", samples: { bd: "bd.wav" } })).toBe(
        false,
      );
    });

    it("detects multisample banks", () => {
      expect(
        isMultiSampleBank({ samples: { piano: { a2: ["a2.wav"] } } }),
      ).toBe(true);
      expect(isMultiSampleBank({ samples: { piano: { a2: "a2.wav" } } })).toBe(
        false,
      );
    });

    it("detects sprite sample banks", () => {
      expect(
        isSpriteSampleBank({
          src: "kit.wav",
          samples: { bd: [[0, 0.08]] },
        }),
      ).toBe(true);
      expect(
        isSpriteSampleBank({ src: "kit.wav", samples: { bd: [0, 0.08] } }),
      ).toBe(false);
    });

    it("detects pitched sprite sample banks", () => {
      expect(
        isPitchedSpriteSampleBank({
          src: "piano.wav",
          samples: { piano: { a2: [[0, 0.1]] } },
        }),
      ).toBe(true);
      expect(
        isPitchedSpriteSampleBank({
          src: "piano.wav",
          samples: { piano: { a2: [0, 0.1] } },
        }),
      ).toBe(false);
    });
  });
});
