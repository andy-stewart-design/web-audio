import type { RenderSettings, SketchCase } from "./types";

export const DEFAULT_SETTINGS: Readonly<RenderSettings> = {
  sampleRate: 48_000,
  channels: 2,
  beatsPerBar: 4,
  startOffsetFrames: 4_800,
};

export const cases: SketchCase[] = [
  {
    id: "sine",
    description: "Real sine synthesis through engine commit and bar scheduling",
    code: "d.synth('sine').notes(69).gain(0.5).adsr(0.01, 0, 1, 0.05).push();",
    bars: 1,
    tailSeconds: 0.25,
  },
  {
    id: "sample-tone",
    description: "Real fetch/decode/playback of a local 440 Hz sample",
    code: "d.loadSamples({bank: 'local', samples: {tone: ['/samples/tone.wav']}}); d.sample('tone').bank('local').clip(false).push();",
    resources: { "/samples/tone.wav": "resources/tone.wav" },
    bars: 1,
    tailSeconds: 0.1,
  },
  {
    id: "sample-reverse",
    description: "Real reversal of a local asymmetric sample",
    code: "d.loadSamples({bank: 'local', samples: {hit: ['/samples/asymmetric.wav']}}); d.sample('hit').bank('local').direction('reverse').clip(false).push();",
    resources: { "/samples/asymmetric.wav": "resources/asymmetric.wav" },
    bars: 1,
    tailSeconds: 0.1,
  },
  {
    id: "lfo-filter",
    description: "Real LFO filter sweep with changing bar-level endpoints",
    code: "d.synth('sawtooth').notes(57).gain(0.3).adsr(0.005, 0, 1, 0.02).fx(d.lpf(d.lfo([300, 900], [2500, 4500]).norm().wave('sine').speed(1).off(0.25)).q(0.5)).push();",
    bars: 2,
    tailSeconds: 0.15,
  },
  {
    id: "seeded-multibar",
    description:
      "Explicitly seeded chance timing and random pitches over three bars",
    code: "d.synth('sine').notes(d.rand().int().range(57, 81).steps(8).ribbon(11)).xox(d.rand().bin().steps(8).chance(0.6).ribbon(42)).gain(0.4).adsr(0.005, 0, 1, 0.02).push();",
    bars: 3,
    tailSeconds: 0.1,
  },
  {
    id: "sample-alternate",
    description: "Alternate sample direction across an odd-hit bar boundary",
    code: "d.loadSamples({bank: 'local', samples: {hit: ['/samples/asymmetric.wav']}}); d.sample('hit').bank('local').sequence(3, [0, 1, 2]).direction('alternate').clip(false).push();",
    resources: { "/samples/asymmetric.wav": "resources/asymmetric.wav" },
    bars: 2,
    tailSeconds: 0.1,
  },
];

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

export function selectCase(registry: SketchCase[], id: string) {
  if (registry.length === 0) throw new Error("Case registry is empty");
  const normalized = registry.map(normalizeCase);
  const ids = new Set<string>();
  for (const sketch of normalized) {
    if (ids.has(sketch.id)) throw new Error(`Duplicate case ID: ${sketch.id}`);
    ids.add(sketch.id);
  }
  const selected = normalized.find((sketch) => sketch.id === id);
  if (!selected) throw new Error(`Unknown case: ${id}`);
  return selected;
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
