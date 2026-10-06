import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readRecording, writeRecording } from "../runner/recording";
import { withRenderer } from "../runner/render";
import { sketch } from "./support/cases";

describe("native render to float-WAV storage", () => {
  it("preserves full real stereo, mono/44.1 kHz and above-one audio exactly", async () => {
    const directory = await mkdtemp(join(tmpdir(), "rendered-recording-"));
    try {
      await withRenderer(async (renderer) => {
        for (const input of [
          sketch(),
          sketch({
            id: "mono",
            settings: {
              channels: 1,
              sampleRate: 44_100,
              startOffsetFrames: 4_410,
            },
          }),
          sketch({
            id: "hot",
            code: "d.synth('sine').notes(69).gain(4).adsr(0.01, 0, 1, 0.05).push();",
          }),
        ]) {
          const rendered = await renderer.render(input);
          const path = join(directory, `${input.id}.wav`);
          await writeRecording(path, rendered);
          const stored = await readRecording(path);
          expect(stored.sampleRate).toBe(rendered.settings.sampleRate);
          expect(stored.frameCount).toBe(rendered.frameCount);
          expect(stored.metadata).toEqual({
            id: rendered.id,
            settings: rendered.settings,
            bars: rendered.bars,
            tailSeconds: rendered.tailSeconds,
            bpm: rendered.bpm,
            frameCount: rendered.frameCount,
            browserVersion: rendered.browserVersion,
          });
          for (let channel = 0; channel < rendered.channels.length; channel++) {
            const original = rendered.channels[channel];
            const output = stored.channels[channel];
            if (!original || !output) throw new Error("Missing stored channel");
            expect(
              output.every((value, frame) => Object.is(value, original[frame])),
            ).toBe(true);
          }
          if (input.id === "hot")
            expect(rendered.metrics[0]?.peak).toBeGreaterThan(1);
          expect(renderer.browser.contexts()).toHaveLength(0);
        }
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
