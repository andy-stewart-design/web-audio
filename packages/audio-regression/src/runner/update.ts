import { join, resolve } from "node:path";
import { cases, selectCase } from "../cases";
import type { SketchCase } from "../types";
import { inspectAudio } from "./audio";
import { REFERENCE_DIRECTORY, writeRecording } from "./recording";
import { withRenderer } from "./render";

type UpdateOptions = {
  referenceDirectory?: string;
  report?: (message: string) => void;
};

export function parseUpdateSelector(args: string[]) {
  if (args.length !== 2 || args[0] !== "--case" || !args[1])
    throw new Error("Usage: audio:update --case <id>");
  return args[1];
}

export async function updateReference(
  renderer: Pick<Parameters<Parameters<typeof withRenderer>[0]>[0], "render">,
  registry: SketchCase[],
  caseId: string,
  options: UpdateOptions = {},
) {
  const selected = selectCase(registry, caseId);
  const referenceDirectory = resolve(
    options.referenceDirectory ?? REFERENCE_DIRECTORY,
  );
  const report = (message: string) =>
    options.report?.(`[${selected.id}] ${message}`);
  report("Rendering fresh audio for explicit reference update");
  // No directory creation or old-reference writes before successful rendering.
  // The renderer rejects source/resource/worklet/timeout failures and partial audio.
  const result = await renderer.render(selected);
  if (result.id !== selected.id)
    throw new Error(
      `Reference update case ID mismatch: expected ${selected.id}, got ${result.id}`,
    );
  const metrics = inspectAudio(result.channels, selected.expectSilence);
  // Storage validates all metadata/shape/finite samples and encodes before I/O.
  // This is one selected ordinary WAV/JSON write, not an atomic transaction.
  const paths = await writeRecording(
    join(referenceDirectory, `${selected.id}.wav`),
    result,
  );
  report(
    `Chromium ${result.browserVersion}; ${result.settings.sampleRate} Hz, ${result.channels.length} channels, ${result.frameCount} frames, ${result.bpm} BPM`,
  );
  metrics.forEach(({ peak, rms }, channel) =>
    report(
      `Channel ${channel}: peak=${peak.toPrecision(6)} RMS=${rms.toPrecision(6)}`,
    ),
  );
  report(`Reference WAV: ${paths.wav}\nSettings: ${paths.json}`);
  report(
    "Reference recording written. Not listening approval: listen, review the changes, and commit only intended output.",
  );
  return { id: selected.id, paths, metrics };
}

export async function update(
  args: string[],
  options: UpdateOptions & { registry?: SketchCase[] } = {},
) {
  const caseId = parseUpdateSelector(args);
  const registry = options.registry ?? cases;
  selectCase(registry, caseId); // Reject invalid selection before browser startup.
  return withRenderer((renderer) =>
    updateReference(renderer, registry, caseId, options),
  );
}
