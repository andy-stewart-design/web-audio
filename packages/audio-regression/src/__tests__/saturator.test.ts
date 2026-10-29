import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compareAudio } from "../runner/compare";
import { writeRecording } from "../runner/recording";
import { withRenderer } from "../runner/render";
import type { SketchCase } from "../types";

const sampleTone = fileURLToPath(
  new URL("../../cases/sample-tone/samples/tone.wav", import.meta.url),
);
const candidatePath = fileURLToPath(
  new URL("../../artifacts/saturator/candidate-48000.wav", import.meta.url),
);

const candidateCase: SketchCase = {
  id: "saturator-candidate-48000",
  description: "Portable synth, sampler, and named-bus listening candidate",
  code: `d.bpm(128);
d.loadSamples({
  bank: "local",
  samples: { tone: ["/samples/tone.wav"] },
});
d.bus("drums").fx(d.saturator(2.2).postgain([0.22, 0.32]));
d.synth("sawtooth")
  .notes([48, 55])
  .xox("x..x")
  .gain(0.3)
  .adsr(0.01, 0.05, 0.8, 0.12)
  .fx(d.saturator(1.25).postgain(0.7))
  .push();
d.sample("tone")
  .bank("local")
  .xox(".x..")
  .gain(0.55)
  .adsr(0.02, 0, 1, 0.08)
  .fx(d.saturator(3).postgain(0.2))
  .push();
d.synth("square")
  .notes([36, 43])
  .xox("x...")
  .gain(0.28)
  .route("drums")
  .push();`,
  bars: 2,
  tailSeconds: 0.25,
  settings: { sampleRate: 48_000, channels: 2, startOffsetFrames: 4_417 },
  resources: { "/samples/tone.wav": sampleTone },
};

describe("native public saturator candidate", () => {
  it("renders repeatable finite audio and writes the unregistered candidate", async () => {
    await withRenderer(async (renderer) => {
      const first = await renderer.render(candidateCase);
      const second = await renderer.render(candidateCase);
      const comparison = compareAudio(
        { sampleRate: 48_000, channels: first.channels },
        { sampleRate: 48_000, channels: second.channels },
      );
      expect(comparison.passed, JSON.stringify(comparison)).toBe(true);
      await writeRecording(candidatePath, first);
    });
  });
});
