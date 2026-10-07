import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { loadCases } from "../runner/load-cases";
import { readRecording } from "../runner/recording";
import { withRenderer } from "../runner/render";
import { updateReference } from "../runner/update";
import { verifyCases } from "../runner/verify";
import { sampleWav } from "./support/cases";
import { expectUnchanged, snapshot } from "./support/reference-files";

it("loads local sketches/samples, updates explicitly, rejects changed audio and missing resources, and recovers read-only", async () => {
  const directory = await mkdtemp(join(tmpdir(), "audio-case-files-native-"));
  const root = join(directory, "cases");
  const folder = join(root, "multiline");
  const sample = join(folder, "samples/tone.wav");
  const source = join(folder, "sketch.js");
  const paths = {
    referenceDirectory: join(directory, "references"),
    artifactDirectory: join(directory, "artifacts"),
  };
  const code = `const bank = "local";
d.loadSamples({ bank, samples: { tone: ["/samples/tone.wav"] } });
d.sample("tone").bank(bank).clip(false).push();
for (const note of [69, 72]) {
  drome.synth("sine").notes(note).gain(0.125).push();
}
`;
  try {
    await mkdir(join(folder, "samples"), { recursive: true });
    await writeFile(sample, sampleWav);
    await writeFile(
      join(folder, "metadata.json"),
      JSON.stringify({
        description: "Temporary multiline synth and local sampler",
        bars: 1,
        tailSeconds: 0.1,
      }),
    );
    await writeFile(source, code);
    await withRenderer(async (renderer) => {
      const registry = await loadCases(root);
      await updateReference(renderer, registry, "multiline", paths);
      const before = await snapshot(paths.referenceDirectory);
      const verify = async () =>
        verifyCases(renderer, await loadCases(root), paths);
      expect((await verify()).passed).toBe(true);

      await writeFile(source, code.replace("[69, 72]", "[81, 84]"));
      const changed = await verify();
      expect(changed.passed).toBe(false);
      const failed = changed.results[0]!;
      expect(failed.comparison?.passed).toBe(false);
      const a = await readRecording(failed.artifacts.reference!.wav);
      const b = await readRecording(failed.artifacts.current!.wav);
      const difference = await readRecording(failed.artifacts.difference!.wav);
      expect(
        difference.channels.every((channel, index) =>
          channel.every((value, frame) =>
            Object.is(
              value,
              Math.fround(
                b.channels[index]![frame]! - a.channels[index]![frame]!,
              ),
            ),
          ),
        ),
      ).toBe(true);
      await expectUnchanged(paths.referenceDirectory, before);

      await writeFile(source, code);
      await rm(sample);
      const missing = await verify();
      expect(missing.passed).toBe(false);
      expect(missing.results[0]!.artifacts.current).toBeUndefined();
      expect(missing.results[0]!.artifacts.difference).toBeUndefined();
      await expect(
        updateReference(renderer, await loadCases(root), "multiline", paths),
      ).rejects.toThrow();
      await expectUnchanged(paths.referenceDirectory, before);

      await writeFile(sample, sampleWav);
      expect((await verify()).passed).toBe(true);
      await expectUnchanged(paths.referenceDirectory, before);
      await expect(
        readFile(join(paths.artifactDirectory, "multiline", "current.wav")),
      ).rejects.toMatchObject({ code: "ENOENT" });
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
