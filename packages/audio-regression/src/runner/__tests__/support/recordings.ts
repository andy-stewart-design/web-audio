import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeCase, planRender } from "../../../cases";
import type { SketchCase } from "../../../types";

// Unapproved unit fixtures: source is never evaluated by the stub renderer.
export const sketch: SketchCase = {
  id: "test",
  description: "Temporary recording fixture",
  code: "unused by unit renderer",
  bars: 1,
  tailSeconds: 0,
  settings: { sampleRate: 3000, channels: 2, startOffsetFrames: 0 },
};

export function recording(input = sketch, value = 1.25) {
  const normalized = normalizeCase(input);
  const layout = planRender(normalized);
  return {
    ...normalized,
    ...layout,
    channels: Array.from({ length: normalized.settings.channels }, () =>
      new Float32Array(layout.frameCount).fill(value),
    ),
    metrics: [],
    browserVersion: "test-browser",
  };
}

export async function withDirectories<T>(
  run: (paths: {
    referenceDirectory: string;
    artifactDirectory: string;
  }) => Promise<T>,
) {
  const directory = await mkdtemp(join(tmpdir(), "audio-recording-unit-"));
  try {
    return await run({
      referenceDirectory: join(directory, "references"),
      artifactDirectory: join(directory, "artifacts"),
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
