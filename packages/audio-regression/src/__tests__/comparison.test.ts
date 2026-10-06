import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compareAudio, formatComparison } from "../runner/compare";
import { readRecording, writeRecording } from "../runner/recording";
import { withRenderer } from "../runner/render";
import { sketch } from "./support/cases";

describe("real rendered audio comparison", () => {
  it("compares stored float-WAV samples to fresh native output and rejects a real gain change", async () => {
    const directory = await mkdtemp(join(tmpdir(), "audio-comparison-"));
    try {
      await withRenderer(async (renderer) => {
        const original = await renderer.render(sketch());
        const path = join(directory, "unapproved-test.wav");
        await writeRecording(path, original);
        const stored = await readRecording(path);
        const fresh = await renderer.render(sketch());
        const identity = compareAudio(stored, {
          sampleRate: fresh.settings.sampleRate,
          channels: fresh.channels,
        });
        expect(identity.passed).toBe(true);
        expect(
          identity.channels.every(
            ({ maxError, rmsError }) => maxError === 0 && rmsError === 0,
          ),
        ).toBe(true);
        const changed = await renderer.render(
          sketch({
            id: "gain-change",
            code: sketch().code.replace("gain(0.5)", "gain(0.55)"),
          }),
        );
        const mismatch = compareAudio(stored, {
          sampleRate: changed.settings.sampleRate,
          channels: changed.channels,
        });
        expect(mismatch.passed).toBe(false);
        expect(mismatch.worst?.error).toBeGreaterThan(0.01);
        expect(mismatch.worst?.frame).toBeGreaterThanOrEqual(4_800);
        expect(formatComparison(mismatch)).toContain("Audio comparison FAILED");
        const unchanged = await readRecording(path);
        expect(
          unchanged.channels[0]?.every((sample, frame) =>
            Object.is(sample, stored.channels[0]?.[frame]),
          ),
        ).toBe(true);
        expect(renderer.browser.contexts()).toHaveLength(0);
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
