import type {
  MultiSampleBank,
  BankedSampleBank,
  PitchedSpriteSampleBank,
  SampleBank,
  SpriteLeaf,
  SpriteSampleBank,
} from "@/types";
import type { BankDefinition, BankSchema } from "@web-audio/schema";
import { noteStringToMidi } from "./note-string-to-midi";

const invalidManifestMessage =
  "Invalid sample manifest: expected a sample bank, banked sample bank, multisample bank, or sprite bank";

// -----------------------------------------------------------------------------
// Normalization
// -----------------------------------------------------------------------------
// User-facing loadSamples() shapes are intentionally flexible. Everything in
// this section converts those shapes into the single normalized BankSchema shape
// consumed by schema/engine code.

function _resolveSrc(src: string, baseUrl = "") {
  if (!baseUrl) return src;
  if (/^(https?:|data:|blob:)/.test(src)) return src;
  return `${baseUrl.replace(/\/+$/, "")}/${src.replace(/^\/+/, "")}`;
}

function _normalizeFileVariations(paths: string[], baseUrl = "") {
  return paths.map((path) => ({
    type: "file" as const,
    src: _resolveSrc(path, baseUrl),
  }));
}

function _normalizeSimpleSamples(
  samples: SampleBank,
  basePath = "",
): BankSchema["samples"] {
  const normalized: BankSchema["samples"] = {};
  for (const [name, paths] of Object.entries(samples)) {
    normalized[name] = { "0": _normalizeFileVariations(paths, basePath) };
  }
  return normalized;
}

// Multisample authoring uses pitch names like "a2" and "c#4". Normalized bank
// schemas use stringified MIDI numbers like "45" so runtime lookup is simple.
function _pitchKeyToMidi(key: string) {
  if (!/^[A-Ga-g][#b]?-?\d+$/.test(key)) {
    throw new Error(`Invalid sample pitch key "${key}"`);
  }

  const midi = noteStringToMidi(key as never);
  if (midi === null) throw new Error(`Invalid sample pitch key "${key}"`);

  return midi;
}

function _normalizeMultiSamples(
  samples: MultiSampleBank["samples"],
  baseUrl = "",
) {
  const normalized: BankSchema["samples"] = {};

  for (const [sampleName, keyedSamples] of Object.entries(samples)) {
    normalized[sampleName] = {};
    for (const [key, paths] of Object.entries(keyedSamples)) {
      normalized[sampleName][String(_pitchKeyToMidi(key))] =
        _normalizeFileVariations(paths, baseUrl);
    }
  }

  return normalized;
}

function _normalizeSpriteLeaf(src: string, leaf: SpriteLeaf) {
  const type = "sprite" as const;
  return leaf.map(([start, end]) => ({ type, src, start, end }));
}

function _normalizeSpriteSamples(input: SpriteSampleBank) {
  const normalized: BankSchema["samples"] = {};

  for (const [sampleName, leaf] of Object.entries(input.samples)) {
    normalized[sampleName] = {
      "0": _normalizeSpriteLeaf(_resolveSrc(input.src, input.baseUrl), leaf),
    };
  }

  return normalized;
}

function _normalizePitchedSpriteSamples(input: PitchedSpriteSampleBank) {
  const normalized: BankSchema["samples"] = {};

  for (const [sampleName, keyedRegions] of Object.entries(input.samples)) {
    normalized[sampleName] = {};
    for (const [key, leaf] of Object.entries(keyedRegions)) {
      normalized[sampleName][String(_pitchKeyToMidi(key))] =
        _normalizeSpriteLeaf(_resolveSrc(input.src, input.baseUrl), leaf);
    }
  }

  return normalized;
}

// Built-in bank files still use the original BankDefinition authoring shape:
// basePath + relative file paths. Resolve them into normalized file entries.
function resolveBank(def: BankDefinition): BankSchema {
  return { samples: _normalizeSimpleSamples(def.samples, def.basePath) };
}

function normalizeSampleBank(input: unknown): BankSchema {
  if (isBankedBank(input)) {
    return { samples: _normalizeSimpleSamples(input.samples, input.baseUrl) };
  }

  // Banked sprite/multisample inputs are structurally identical to their
  // unnamed variants plus an extra `bank` field, so the same guards handle both.
  if (isPitchedSpriteSampleBank(input)) {
    return { samples: _normalizePitchedSpriteSamples(input) };
  }

  if (isSpriteSampleBank(input)) {
    return { samples: _normalizeSpriteSamples(input) };
  }

  if (isMultiSampleBank(input)) {
    return { samples: _normalizeMultiSamples(input.samples, input.baseUrl) };
  }

  if (isSampleBank(input)) {
    return { samples: _normalizeSimpleSamples(input) };
  }

  throw new Error(invalidManifestMessage);
}

// -----------------------------------------------------------------------------
// Type guards
// -----------------------------------------------------------------------------
// These validate the supported loadSamples() authoring shapes. They are kept
// composable so named variants can reuse the same guards as unnamed variants.

function _isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

// A sprite region is a normalized [start, end] tuple. Bare regions are not valid
// sample leaves; sprite leaves must be arrays of regions so they mirror file
// variation arrays.
function _isSpriteRegion(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    value[0] >= 0 &&
    value[0] < value[1] &&
    value[1] <= 1
  );
}

function _isSpriteLeaf(value: unknown): value is SpriteLeaf {
  return (
    Array.isArray(value) && value.length > 0 && value.every(_isSpriteRegion)
  );
}

function _hasSprite(
  obj: unknown,
): obj is { src: string; samples: unknown; baseUrl?: string } {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  const record = obj as Record<string, unknown>;
  return (
    typeof record.src === "string" &&
    !!record.samples &&
    (record.baseUrl === undefined || typeof record.baseUrl === "string")
  );
}

function isBanked(obj: unknown): obj is { bank: string } {
  return (
    !!obj &&
    typeof obj === "object" &&
    !Array.isArray(obj) &&
    typeof (obj as Record<string, unknown>).bank === "string"
  );
}

function isSampleBank(obj: unknown): obj is SampleBank {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;

  return Object.values(obj as Record<string, unknown>).every(_isStringArray);
}

function isBankedBank(obj: unknown): obj is BankedSampleBank {
  if (!isBanked(obj)) return false;
  return isSampleBank((obj as Record<string, unknown>).samples);
}

function isSpriteSampleBank(obj: unknown): obj is SpriteSampleBank {
  if (!_hasSprite(obj)) return false;
  const samples = obj.samples;
  if (!samples || typeof samples !== "object" || Array.isArray(samples)) {
    return false;
  }
  return Object.values(samples as Record<string, unknown>).every(_isSpriteLeaf);
}

function isPitchedSpriteSampleBank(
  obj: unknown,
): obj is PitchedSpriteSampleBank {
  if (!_hasSprite(obj)) return false;
  const samples = obj.samples;
  if (!samples || typeof samples !== "object" || Array.isArray(samples)) {
    return false;
  }
  return Object.values(samples as Record<string, unknown>).every(
    (value) =>
      !!value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.values(value as Record<string, unknown>).every(_isSpriteLeaf),
  );
}

function isMultiSampleBank(obj: unknown): obj is MultiSampleBank {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  const record = obj as Record<string, unknown>;
  const samples = record.samples;
  if (!samples || typeof samples !== "object" || Array.isArray(samples)) {
    return false;
  }

  return Object.values(samples as Record<string, unknown>).every(
    (value) =>
      !!value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.values(value as Record<string, unknown>).every(_isStringArray),
  );
}

export {
  invalidManifestMessage,
  isMultiSampleBank,
  isBanked,
  isBankedBank,
  isPitchedSpriteSampleBank,
  isSampleBank,
  isSpriteSampleBank,
  normalizeSampleBank,
  resolveBank,
};
