import type {
  MultiSampleBank,
  NamedSampleBank,
  PitchedSpriteSampleBank,
  SampleBank,
  SpriteLeaf,
  SpriteSampleBank,
} from "@/types";
import type { BankDefinition, BankSchema } from "@web-audio/schema";
import { noteStringToMidi } from "./note-string-to-midi";

const invalidManifestMessage =
  "Invalid sample manifest: expected a sample bank, named sample bank, multisample bank, or sprite bank";

// -----------------------------------------------------------------------------
// Normalization
// -----------------------------------------------------------------------------
// User-facing loadSamples() shapes are intentionally flexible. Everything in
// this section converts those shapes into the single normalized BankSchema shape
// consumed by schema/engine code.

function normalizeFileVariations(paths: string[], basePath = "") {
  return paths.map((path) => ({
    type: "file" as const,
    src: basePath + path,
  }));
}

function normalizeSimpleSamples(
  samples: SampleBank,
  basePath = "",
): BankSchema["samples"] {
  const normalized: BankSchema["samples"] = {};
  for (const [name, paths] of Object.entries(samples)) {
    normalized[name] = { "0": normalizeFileVariations(paths, basePath) };
  }
  return normalized;
}

// Multisample authoring uses pitch names like "a2" and "c#4". Normalized bank
// schemas use stringified MIDI numbers like "45" so runtime lookup is simple.
function pitchKeyToMidi(key: string) {
  if (!/^[A-Ga-g][#b]?-?\d+$/.test(key)) {
    throw new Error(`Invalid sample pitch key "${key}"`);
  }

  const midi = noteStringToMidi(key as never);
  if (midi === null) {
    throw new Error(`Invalid sample pitch key "${key}"`);
  }
  return midi;
}

function normalizeMultiSamples(samples: MultiSampleBank["samples"]) {
  const normalized: BankSchema["samples"] = {};
  for (const [sampleName, keyedSamples] of Object.entries(samples)) {
    normalized[sampleName] = {};
    for (const [key, paths] of Object.entries(keyedSamples)) {
      normalized[sampleName][String(pitchKeyToMidi(key))] =
        normalizeFileVariations(paths);
    }
  }
  return normalized;
}

function normalizeSpriteLeaf(src: string, leaf: SpriteLeaf) {
  return leaf.map(([start, end]) => ({
    type: "sprite" as const,
    src,
    start,
    end,
  }));
}

function normalizeSpriteSamples(input: SpriteSampleBank) {
  const normalized: BankSchema["samples"] = {};
  for (const [sampleName, leaf] of Object.entries(input.samples)) {
    normalized[sampleName] = { "0": normalizeSpriteLeaf(input.sprite, leaf) };
  }
  return normalized;
}

function normalizePitchedSpriteSamples(input: PitchedSpriteSampleBank) {
  const normalized: BankSchema["samples"] = {};
  for (const [sampleName, keyedRegions] of Object.entries(input.samples)) {
    normalized[sampleName] = {};
    for (const [key, leaf] of Object.entries(keyedRegions)) {
      normalized[sampleName][String(pitchKeyToMidi(key))] = normalizeSpriteLeaf(
        input.sprite,
        leaf,
      );
    }
  }
  return normalized;
}

// Built-in bank files still use the original BankDefinition authoring shape:
// basePath + relative file paths. Resolve them into normalized file entries.
function resolveBank(def: BankDefinition): BankSchema {
  return { samples: normalizeSimpleSamples(def.samples, def.basePath) };
}

function normalizeLoadSamplesInput(input: LoadSamplesInput): BankSchema {
  if (isNamedBank(input)) {
    return { samples: normalizeSimpleSamples(input.samples) };
  }

  if (isNamed(input)) {
    const bank: Record<string, unknown> = { ...input };
    delete bank.name;
    return normalizeLoadSamplesInput(bank as LoadSamplesInput);
  }

  if (isPitchedSpriteSampleBank(input)) {
    return { samples: normalizePitchedSpriteSamples(input) };
  }

  if (isSpriteSampleBank(input)) {
    return { samples: normalizeSpriteSamples(input) };
  }

  if (isMultiSampleBank(input)) {
    return { samples: normalizeMultiSamples(input.samples) };
  }

  if (isSampleBank(input)) {
    return { samples: normalizeSimpleSamples(input) };
  }

  throw new Error(invalidManifestMessage);
}

// -----------------------------------------------------------------------------
// Type guards
// -----------------------------------------------------------------------------
// These validate the supported loadSamples() authoring shapes. They are kept
// composable so named variants can reuse the same guards as unnamed variants.

function isNamed(obj: unknown): obj is { name: string } {
  return (
    !!obj &&
    typeof obj === "object" &&
    !Array.isArray(obj) &&
    typeof (obj as Record<string, unknown>).name === "string"
  );
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

// A sprite region is a normalized [start, end] tuple. Bare regions are not valid
// sample leaves; sprite leaves must be arrays of regions so they mirror file
// variation arrays.
function isSpriteRegion(value: unknown): value is [number, number] {
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

function isSpriteLeaf(value: unknown): value is SpriteLeaf {
  return (
    Array.isArray(value) && value.length > 0 && value.every(isSpriteRegion)
  );
}

function isSampleBank(obj: unknown): obj is SampleBank {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;

  return Object.values(obj as Record<string, unknown>).every(isStringArray);
}

function isNamedBank(obj: unknown): obj is NamedSampleBank {
  if (!isNamed(obj)) return false;
  return isSampleBank((obj as Record<string, unknown>).samples);
}

function hasSprite(obj: unknown): obj is { sprite: string; samples: unknown } {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  const record = obj as Record<string, unknown>;
  return typeof record.sprite === "string" && !!record.samples;
}

function isSpriteSampleBank(obj: unknown): obj is SpriteSampleBank {
  if (!hasSprite(obj)) return false;
  const samples = obj.samples;
  if (!samples || typeof samples !== "object" || Array.isArray(samples)) {
    return false;
  }
  return Object.values(samples as Record<string, unknown>).every(isSpriteLeaf);
}

function isPitchedSpriteSampleBank(
  obj: unknown,
): obj is PitchedSpriteSampleBank {
  if (!hasSprite(obj)) return false;
  const samples = obj.samples;
  if (!samples || typeof samples !== "object" || Array.isArray(samples)) {
    return false;
  }
  return Object.values(samples as Record<string, unknown>).every(
    (value) =>
      !!value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.values(value as Record<string, unknown>).every(isSpriteLeaf),
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
      Object.values(value as Record<string, unknown>).every(isStringArray),
  );
}

// -----------------------------------------------------------------------------
// Local input union
// -----------------------------------------------------------------------------
// Re-declared here to include named generic variants without exporting utility
// implementation details from the public fluid types surface.

type LoadSamplesInput =
  | SampleBank
  | NamedSampleBank
  | SpriteSampleBank
  | (SpriteSampleBank & { name: string })
  | PitchedSpriteSampleBank
  | (PitchedSpriteSampleBank & { name: string })
  | MultiSampleBank
  | (MultiSampleBank & { name: string });

export {
  invalidManifestMessage,
  isMultiSampleBank,
  isNamed,
  isNamedBank,
  isPitchedSpriteSampleBank,
  isSampleBank,
  isSpriteSampleBank,
  normalizeLoadSamplesInput,
  resolveBank,
};
