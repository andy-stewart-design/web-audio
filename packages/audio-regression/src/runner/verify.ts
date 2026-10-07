import { rm } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { selectCases } from "../cases";
import type { SketchCase } from "../types";
import { compareAudio, formatComparison } from "./compare";
import { loadCases } from "./load-cases";
import {
  REFERENCE_DIRECTORY,
  readRecording,
  referencePath,
  writeRecording,
} from "./recording";
import { withRenderer } from "./render";

const artifactDirectory = fileURLToPath(
  new URL("../../artifacts/verify/", import.meta.url),
);

type VerificationOptions = {
  caseId?: string;
  referenceDirectory?: string;
  artifactDirectory?: string;
  report?: (message: string) => void;
};

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export function parseVerifySelector(args: string[]) {
  if (args.length === 0) return undefined;
  if (args.length !== 2 || args[0] !== "--case" || !args[1])
    throw new Error("Usage: audio:verify [--case <id>]");
  return args[1];
}

function verificationPaths(options: VerificationOptions) {
  const references = resolve(options.referenceDirectory ?? REFERENCE_DIRECTORY);
  const artifacts = resolve(options.artifactDirectory ?? artifactDirectory);
  // Never allow configurable artifact cleanup/writes to target the reference tree.
  const contains = (parent: string, child: string) => {
    const path = relative(parent, child);
    return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
  };
  if (contains(references, artifacts) || contains(artifacts, references))
    throw new Error(
      "Reference and artifact directories must be separate, non-overlapping trees",
    );
  return { references, artifacts };
}

function differenceAudio(
  reference: { sampleRate: number; channels: readonly Float32Array[] },
  current: typeof reference,
) {
  if (
    reference.sampleRate !== current.sampleRate ||
    reference.channels.length !== current.channels.length ||
    reference.channels.some(
      (channel, index) => channel.length !== current.channels[index]?.length,
    )
  )
    throw new Error(
      "Difference unavailable: audio shapes differ; no resampling, trimming or channel remapping is allowed",
    );
  // Signed current - reference, retained as float32 for standard float-WAV storage.
  // No playback amplification; unrepresentable differences are reported, not clipped.
  return current.channels.map((channel, index) => {
    const result = new Float32Array(channel.length);
    for (let frame = 0; frame < channel.length; frame++) {
      result[frame] = channel[frame]! - reference.channels[index]![frame]!;
      if (!Number.isFinite(result[frame]))
        throw new Error(
          `Difference unavailable: non-finite Float32 difference in channel ${index} at frame ${frame}`,
        );
    }
    return result;
  });
}

export async function verifyCases(
  renderer: Pick<Parameters<Parameters<typeof withRenderer>[0]>[0], "render">,
  registry: SketchCase[],
  options: VerificationOptions = {},
) {
  const selected = selectCases(registry, options.caseId);
  const paths = verificationPaths(options);
  const results = [];
  for (const sketch of selected) {
    const messages: string[] = [];
    const errors: string[] = [];
    const report = (message: string) => {
      messages.push(message);
      options.report?.(`[${sketch.id}] ${message}`);
    };
    report("Verifying fresh native audio");
    const output = join(paths.artifacts, sketch.id);
    const canWrite = await rm(output, { recursive: true, force: true }).then(
      () => true,
      (error: unknown) => {
        errors.push(
          `Could not clear stale failure artifacts: ${messageOf(error)}`,
        );
        return false;
      },
    );
    const reference = await readRecording(
      referencePath(sketch.id, paths.references),
    )
      .then((recording) => {
        if (recording.metadata.id !== sketch.id)
          throw new Error(
            `Reference case ID mismatch: expected ${sketch.id}, got ${recording.metadata.id}`,
          );
        return recording;
      })
      .catch((error: unknown) => {
        errors.push(
          `Reference unavailable (missing or invalid): ${messageOf(error)}`,
        );
        return undefined;
      });
    // Always render, even when the reference is absent or invalid. No hash/version skip.
    const current = await renderer.render(sketch).catch((error: unknown) => {
      errors.push(`Render failed: ${messageOf(error)}`);
      return undefined;
    });
    let comparison: ReturnType<typeof compareAudio> | undefined;
    if (current)
      report(
        `Chromium ${current.browserVersion}; ${current.settings.sampleRate} Hz, ${current.channels.length} channels, ${current.frameCount} frames, ${current.bpm} BPM`,
      );
    if (reference && current) {
      if (reference.metadata.browserVersion !== current.browserVersion)
        report(
          `Warning: browser version changed from ${reference.metadata.browserVersion} to ${current.browserVersion}; comparing audio, not skipping`,
        );
      try {
        comparison = compareAudio(
          reference,
          {
            sampleRate: current.settings.sampleRate,
            channels: current.channels,
          },
          { expectSilence: sketch.expectSilence },
        );
        report(formatComparison(comparison));
        if (!comparison.passed) errors.push("Audio mismatch");
      } catch (error) {
        errors.push(`Comparison failed: ${messageOf(error)}`);
      }
    }
    const artifacts: Partial<
      Record<
        "reference" | "current" | "difference",
        Awaited<ReturnType<typeof writeRecording>>
      >
    > = {};
    if (errors.length) {
      errors.forEach(report);
      if (canWrite) {
        const save = async (
          kind: keyof typeof artifacts,
          recording: Parameters<typeof writeRecording>[1],
        ) => {
          try {
            artifacts[kind] = await writeRecording(
              join(output, `${kind}.wav`),
              recording,
            );
            report(
              `${kind} WAV: ${artifacts[kind]!.wav}\nSettings: ${artifacts[kind]!.json}`,
            );
          } catch (error) {
            const message = `Could not save ${kind} artifact: ${messageOf(error)}`;
            errors.push(message);
            report(message);
          }
        };
        if (reference)
          await save("reference", {
            ...reference.metadata,
            channels: reference.channels,
          });
        if (current) await save("current", current);
        if (reference && current) {
          try {
            const channels = differenceAudio(reference, {
              sampleRate: current.settings.sampleRate,
              channels: current.channels,
            });
            await save("difference", { ...current, channels });
            if (artifacts.difference)
              report(
                "Difference sign: current - reference (no playback amplification)",
              );
          } catch (error) {
            report(messageOf(error));
          }
        }
      }
      if (!current)
        report(
          "No current recording: rendering failed before an accepted buffer was returned",
        );
    }
    const passed = errors.length === 0;
    report(passed ? "PASS" : "FAIL");
    results.push({
      id: sketch.id,
      passed,
      messages,
      errors,
      comparison,
      artifacts,
    });
  }
  const passed = results.every((result) => result.passed);
  options.report?.(
    `Audio verification ${passed ? "passed" : "FAILED"}: ${results.filter((result) => result.passed).length}/${results.length} cases passed. References were not updated.`,
  );
  return { passed, results };
}

export async function verify(
  args: string[],
  options: Omit<VerificationOptions, "caseId"> & {
    registry?: SketchCase[];
  } = {},
) {
  const caseId = parseVerifySelector(args);
  const registry = options.registry ?? (await loadCases());
  // Validate selection/paths before launching; zero selected cases must never pass.
  selectCases(registry, caseId);
  verificationPaths(options);
  return withRenderer((renderer) =>
    verifyCases(renderer, registry, { ...options, caseId }),
  );
}
