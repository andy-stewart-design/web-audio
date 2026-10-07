import type { RenderSettings, SketchCase } from "./types";

export const DEFAULT_SETTINGS: Readonly<RenderSettings> = {
  sampleRate: 48_000,
  channels: 2,
  beatsPerBar: 4,
  startOffsetFrames: 4_800,
};

export function normalizeCase(sketch: SketchCase) {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(sketch.id)) {
    throw new Error(`Invalid case ID: ${sketch.id}`);
  }
  if (!sketch.description.trim() || typeof sketch.code !== "string") {
    throw new Error(
      `[${sketch.id}] Case needs a description and source string`,
    );
  }
  if (!Number.isSafeInteger(sketch.bars) || sketch.bars < 1) {
    throw new Error(`[${sketch.id}] bars must be a positive integer`);
  }
  if (!Number.isFinite(sketch.tailSeconds) || sketch.tailSeconds < 0) {
    throw new Error(
      `[${sketch.id}] tailSeconds must be finite and non-negative`,
    );
  }
  const settings = { ...DEFAULT_SETTINGS, ...sketch.settings };
  if (
    !Number.isInteger(settings.sampleRate) ||
    settings.sampleRate < 3_000 ||
    settings.sampleRate > 384_000
  ) {
    throw new Error(`[${sketch.id}] Invalid sampleRate`);
  }
  if (
    !Number.isInteger(settings.channels) ||
    settings.channels < 1 ||
    settings.channels > 32
  ) {
    throw new Error(`[${sketch.id}] channels must be an integer from 1 to 32`);
  }
  if (!Number.isSafeInteger(settings.beatsPerBar) || settings.beatsPerBar < 1) {
    throw new Error(`[${sketch.id}] beatsPerBar must be a positive integer`);
  }
  if (
    !Number.isSafeInteger(settings.startOffsetFrames) ||
    settings.startOffsetFrames < 0
  ) {
    throw new Error(
      `[${sketch.id}] startOffsetFrames must be a non-negative integer`,
    );
  }
  const resources = { ...sketch.resources };
  for (const [source, file] of Object.entries(resources)) {
    if (!source.trim() || typeof file !== "string" || !file.trim())
      throw new Error(
        `[${sketch.id}] Resources need source URLs and local file paths`,
      );
  }
  return {
    ...sketch,
    settings,
    resources,
    expectSilence: sketch.expectSilence ?? false,
  };
}

export function selectCases(registry: SketchCase[], id?: string) {
  if (registry.length === 0) throw new Error("Case registry is empty");
  const normalized = registry.map(normalizeCase);
  const ids = new Set<string>();
  for (const sketch of normalized) {
    if (ids.has(sketch.id)) throw new Error(`Duplicate case ID: ${sketch.id}`);
    ids.add(sketch.id);
  }
  if (id === undefined) return normalized;
  const selected = normalized.find((sketch) => sketch.id === id);
  if (!selected) throw new Error(`Unknown case: ${id}`);
  return [selected];
}

export function selectCase(registry: SketchCase[], id: string) {
  return selectCases(registry, id)[0]!;
}

export function parseCaseSelector(args: string[]) {
  if (args.length !== 2 || args[0] !== "--case" || !args[1]) {
    throw new Error("Usage: audio:render --case <id>");
  }
  return args[1];
}

export function planRender(
  sketch: ReturnType<typeof normalizeCase>,
  bpm = 120,
) {
  if (!Number.isFinite(bpm) || bpm <= 0)
    throw new Error("BPM must be finite and positive");
  const { sampleRate, startOffsetFrames, beatsPerBar } = sketch.settings;
  const startTime = startOffsetFrames / sampleRate;
  const barDuration = (60 / bpm) * beatsPerBar;
  // Keep the integer offset in frames; converting it to seconds and back can
  // introduce a rounding-only extra frame (e.g. 0.1 + 2 + 0.1 at 48 kHz).
  const frameCount =
    startOffsetFrames +
    Math.ceil(
      sketch.bars * barDuration * sampleRate + sketch.tailSeconds * sampleRate,
    );
  if (
    !Number.isSafeInteger(frameCount) ||
    frameCount < 1 ||
    frameCount > 2 ** 31 - 1
  ) {
    throw new Error(`[${sketch.id}] Invalid offline frame count`);
  }
  return {
    bpm,
    startTime,
    barDuration,
    frameCount,
    duration: frameCount / sampleRate,
  };
}
