import { describe, expect, it } from "vitest";
import {
  isMultiSampleBank,
  isNamed,
  isNamedBank,
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
        normalizeSampleBank({ name: "drums", samples: { bd: ["bd.wav"] } }),
      ).toEqual({
        samples: {
          bd: {
            "0": [{ type: "file", src: "bd.wav" }],
          },
        },
      });
    });

    it("normalizes multisample pitch keys", () => {
      expect(
        normalizeSampleBank({
          name: "acoustic",
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

    it("normalizes sprite banks", () => {
      expect(
        normalizeSampleBank({
          name: "op1",
          sprite: "kit.wav",
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
            "0": [
              { type: "sprite", src: "kit.wav", start: 0.1, end: 0.18 },
            ],
          },
        },
      });
    });

    it("normalizes sprite variations", () => {
      expect(
        normalizeSampleBank({
          sprite: "kit.wav",
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
          name: "acoustic",
          sprite: "piano-sprite.wav",
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

    it("throws for invalid pitch keys", () => {
      expect(() =>
        normalizeSampleBank({
          name: "acoustic",
          samples: { piano: { nope: ["file.wav"] } },
        }),
      ).toThrow('Invalid sample pitch key "nope"');
    });

    it("throws for bare string multisample leaves", () => {
      expect(() =>
        normalizeSampleBank({
          name: "acoustic",
          samples: { piano: { a2: "file.wav" } },
        }),
      ).toThrow(
        "Invalid sample manifest: expected a sample bank, named sample bank, multisample bank, or sprite bank",
      );
    });

    it("throws for bare sprite region leaves", () => {
      expect(() =>
        normalizeSampleBank({
          name: "op1",
          sprite: "kit.wav",
          samples: { bd: [0, 0.08] },
        }),
      ).toThrow(
        "Invalid sample manifest: expected a sample bank, named sample bank, multisample bank, or sprite bank",
      );
    });

    it("throws for invalid sprite bounds", () => {
      expect(() =>
        normalizeSampleBank({
          name: "op1",
          sprite: "kit.wav",
          samples: { bd: [[0.8, 0.2]] },
        }),
      ).toThrow(
        "Invalid sample manifest: expected a sample bank, named sample bank, multisample bank, or sprite bank",
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
    it("detects named objects", () => {
      expect(isNamed({ name: "kit" })).toBe(true);
      expect(isNamed({})).toBe(false);
    });

    it("detects simple sample banks", () => {
      expect(isSampleBank({ bd: ["bd.wav"] })).toBe(true);
      expect(isSampleBank({ bd: "bd.wav" })).toBe(false);
    });

    it("detects named simple sample banks", () => {
      expect(isNamedBank({ name: "kit", samples: { bd: ["bd.wav"] } })).toBe(
        true,
      );
      expect(isNamedBank({ name: "kit", samples: { bd: "bd.wav" } })).toBe(
        false,
      );
    });

    it("detects multisample banks", () => {
      expect(
        isMultiSampleBank({ samples: { piano: { a2: ["a2.wav"] } } }),
      ).toBe(true);
      expect(
        isMultiSampleBank({ samples: { piano: { a2: "a2.wav" } } }),
      ).toBe(false);
    });

    it("detects sprite sample banks", () => {
      expect(
        isSpriteSampleBank({
          sprite: "kit.wav",
          samples: { bd: [[0, 0.08]] },
        }),
      ).toBe(true);
      expect(
        isSpriteSampleBank({ sprite: "kit.wav", samples: { bd: [0, 0.08] } }),
      ).toBe(false);
    });

    it("detects pitched sprite sample banks", () => {
      expect(
        isPitchedSpriteSampleBank({
          sprite: "piano.wav",
          samples: { piano: { a2: [[0, 0.1]] } },
        }),
      ).toBe(true);
      expect(
        isPitchedSpriteSampleBank({
          sprite: "piano.wav",
          samples: { piano: { a2: [0, 0.1] } },
        }),
      ).toBe(false);
    });
  });
});
