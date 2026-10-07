import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COMPARISON_TOLERANCE } from "../runner/audio";
import { readRecording } from "../runner/recording";
import { withRenderer } from "../runner/render";
import { updateReference } from "../runner/update";
import { verifyCases } from "../runner/verify";
import { estimateFrequency, windowPeak } from "./support/cases";
import { expectUnchanged, snapshot } from "./support/reference-files";
import {
  diagnosticRegressions,
  numericalRegressions,
} from "./support/regressions";

async function withDirectories<T>(
  run: (paths: {
    referenceDirectory: string;
    artifactDirectory: string;
  }) => Promise<T>,
) {
  const directory = await mkdtemp(join(tmpdir(), "audio-regressions-"));
  try {
    return await run({
      referenceDirectory: join(directory, "references"),
      artifactDirectory: join(directory, "artifacts"),
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function expectAuthoredChange(
  name: string,
  reference: Awaited<ReturnType<typeof readRecording>>,
  current: typeof reference,
) {
  const a = reference.channels[0]!;
  const b = current.channels[0]!;
  const rate = reference.sampleRate;
  switch (name) {
    case "pitch":
      expect(estimateFrequency(a, 9600, 24000, rate)).toBeCloseTo(440, 0);
      expect(estimateFrequency(b, 9600, 24000, rate)).toBeCloseTo(880, 0);
      break;
    case "timing":
      expect(windowPeak(a, 0.12, 0.05, rate)).toBeGreaterThan(0.1);
      expect(windowPeak(b, 0.12, 0.05, rate)).toBe(0);
      expect(windowPeak(b, 0.62, 0.05, rate)).toBeGreaterThan(0.1);
      break;
    case "gain":
      expect(
        windowPeak(b, 0.3, 0.1, rate) / windowPeak(a, 0.3, 0.1, rate),
      ).toBeCloseTo(1.1, 5);
      break;
    case "filter": {
      const barTwo = 4800 + 2 * rate;
      expect(
        a
          .subarray(0, barTwo)
          .every((sample, frame) => Object.is(sample, b[frame])),
      ).toBe(true);
      expect(
        a
          .subarray(barTwo)
          .some((sample, frame) => sample !== b[barTwo + frame]),
      ).toBe(true);
      break;
    }
    case "sample-selection":
      expect(windowPeak(a, 0.12, 0.05, rate)).toBeCloseTo(0.4375, 3);
      expect(windowPeak(b, 0.12, 0.05, rate)).toBeCloseTo(0.525, 3);
      expect(windowPeak(a, 0.26, 0.1, rate)).toBeGreaterThan(0.4);
      expect(windowPeak(b, 0.26, 0.1, rate)).toBe(0);
      break;
    case "reverse":
      expect(estimateFrequency(a, 5760, 8160, rate)).toBeCloseTo(880, 0);
      expect(estimateFrequency(b, 5760, 8160, rate)).toBeCloseTo(440, 0);
      expect(windowPeak(a, 0.12, 0.05, rate)).toBeCloseTo(0.175, 3);
      expect(windowPeak(b, 0.12, 0.05, rate)).toBeCloseTo(0.525, 3);
      break;
    default:
      throw new Error(`Missing behavioral assertion: ${name}`);
  }
}

describe("focused real-render regression detection", () => {
  it.each(numericalRegressions)(
    "rejects $name changes as numerical regressions, not shape/resource failures",
    async ({ name, original, changed }) => {
      await withDirectories(async (paths) => {
        await withRenderer(async (renderer) => {
          expect(changed.id).toBe(original.id);
          expect(changed.code).not.toBe(original.code);
          await updateReference(renderer, [original], original.id, paths);
          const before = await snapshot(paths.referenceDirectory);
          const baseline = await verifyCases(renderer, [original], paths);
          expect(baseline.passed).toBe(true);
          expect(
            baseline.results[0]!.comparison?.channels.every(
              ({ maxError, rmsError }) => maxError === 0 && rmsError === 0,
            ),
          ).toBe(true);
          await expectUnchanged(paths.referenceDirectory, before);
          const failed = await verifyCases(renderer, [changed], paths);
          expect(failed.passed).toBe(false);
          const result = failed.results[0]!;
          expect(result.errors).toEqual(["Audio mismatch"]);
          expect(result.comparison?.passed).toBe(false);
          expect(result.comparison?.tolerance).toEqual(COMPARISON_TOLERANCE);
          expect(
            result.comparison?.channels.every(
              ({ maxPassed, rmsPassed }) => !maxPassed && !rmsPassed,
            ),
          ).toBe(true);
          expect(result.comparison?.worst?.frame).toBeGreaterThanOrEqual(4800);
          expect(result.messages.join("\n")).toContain("Worst error:");
          expect(result.messages.join("\n")).toContain(
            "Thresholds: max <= 0.000001, RMS <= 1e-7",
          );
          expect(Object.keys(result.artifacts).sort()).toEqual([
            "current",
            "difference",
            "reference",
          ]);
          const reference = await readRecording(
            result.artifacts.reference!.wav,
          );
          const current = await readRecording(result.artifacts.current!.wav);
          const difference = await readRecording(
            result.artifacts.difference!.wav,
          );
          expect(current.sampleRate).toBe(reference.sampleRate);
          expect(current.frameCount).toBe(reference.frameCount);
          expect(current.channels.length).toBe(reference.channels.length);
          expect(
            difference.channels.every((channel, index) =>
              channel.every((sample, frame) =>
                Object.is(
                  sample,
                  Math.fround(
                    current.channels[index]![frame]! -
                      reference.channels[index]![frame]!,
                  ),
                ),
              ),
            ),
          ).toBe(true);
          expectAuthoredChange(name, reference, current);
          await expectUnchanged(paths.referenceDirectory, before);
          // A changed variant must not regenerate its baseline or poison a later original.
          expect((await verifyCases(renderer, [original], paths)).passed).toBe(
            true,
          );
          await expectUnchanged(paths.referenceDirectory, before);
          expect(renderer.browser.contexts()).toHaveLength(0);
        });
      });
    },
  );

  it.each(diagnosticRegressions)(
    "rejects $name regressions before accepting partial audio and preserves the baseline",
    async ({ original, changed, diagnostic }) => {
      await withDirectories(async (paths) => {
        await withRenderer(async (renderer) => {
          await updateReference(renderer, [original], original.id, paths);
          const before = await snapshot(paths.referenceDirectory);
          expect((await verifyCases(renderer, [original], paths)).passed).toBe(
            true,
          );
          const failed = await verifyCases(renderer, [changed], paths);
          expect(failed.passed).toBe(false);
          const result = failed.results[0]!;
          expect(result.messages.join("\n")).toContain(diagnostic);
          expect(result.comparison).toBeUndefined();
          expect(result.artifacts.reference).toBeDefined();
          expect(result.artifacts.current).toBeUndefined();
          expect(result.artifacts.difference).toBeUndefined();
          await expectUnchanged(paths.referenceDirectory, before);
          expect((await verifyCases(renderer, [original], paths)).passed).toBe(
            true,
          );
          await expectUnchanged(paths.referenceDirectory, before);
          expect(renderer.browser.contexts()).toHaveLength(0);
        });
      });
    },
  );
});
