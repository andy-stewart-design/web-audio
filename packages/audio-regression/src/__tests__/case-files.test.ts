import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { loadCases } from "../runner/load-cases";
import { withRenderer } from "../runner/render";
import { updateReference } from "../runner/update";
import { verifyCases } from "../runner/verify";

it("renders file-authored multiline REPL code with colocated samples, discovers edits, rejects missing resources and recovers without reference writes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "audio-case-files-native-"));
  const root = join(directory, "cases");
  const folder = join(root, "multiline");
  const sample = join(folder, "samples/tone.wav");
  const source = join(folder, "sketch.js");
  const original = fileURLToPath(
    new URL("../../cases/sample-tone/samples/tone.wav", import.meta.url),
  );
  const paths = {
    referenceDirectory: join(directory, "references"),
    artifactDirectory: join(directory, "artifacts"),
  };
  const code = `// Variables, loops and both REPL aliases work without a module wrapper.
const bank = "local";
const source = "/samples/tone.wav";
d.loadSamples({ bank, samples: { tone: [source] } });
d.sample("tone").bank(bank).clip(false).push();
// Keep these loop-authored voices on separate steps. Fully overlapping three-voice
// summing showed native repeatability variance; see the feasibility record.
for (const [step, note] of [69, 69].entries()) {
  drome.synth("sine").notes(note).sequence(2, [step]).gain(0.125).adsr(0.01, 0, 1, 0.05).push();
}
`;
  try {
    await mkdir(join(folder, "samples"), { recursive: true });
    await copyFile(original, sample);
    await writeFile(
      join(folder, "metadata.json"),
      JSON.stringify({
        description: "Multiline synth and local sampler",
        bars: 1,
        tailSeconds: 0.1,
        resources: { "/samples/tone.wav": "./samples/tone.wav" },
      }),
    );
    await writeFile(source, code);
    await withRenderer(async (renderer) => {
      const registry = await loadCases(root);
      const updated = await updateReference(
        renderer,
        registry,
        "multiline",
        paths,
      );
      expect(updated.metrics[0]!.rms).toBeGreaterThan(0.1);
      const before = await Promise.all([
        readFile(updated.paths.wav),
        readFile(updated.paths.json),
      ]);
      const baseline = await verifyCases(renderer, registry, paths);
      expect(baseline.passed, baseline.results[0]!.messages.join("\n")).toBe(
        true,
      );
      expect(
        baseline.results[0]!.comparison?.channels.every(
          ({ maxError, rmsError }) => maxError === 0 && rmsError === 0,
        ),
      ).toBe(true);
      await writeFile(source, code.replace("[69, 69]", "[81, 81]"));
      const changed = await verifyCases(renderer, await loadCases(root), paths);
      expect(changed.passed).toBe(false);
      expect(changed.results[0]!.errors).toEqual(["Audio mismatch"]);
      expect(changed.results[0]!.artifacts.difference).toBeDefined();
      await writeFile(source, code);
      await rm(sample);
      const missing = await verifyCases(renderer, await loadCases(root), paths);
      expect(missing.passed).toBe(false);
      expect(missing.results[0]!.messages.join("\n")).toContain(
        "Failed to load",
      );
      expect(missing.results[0]!.artifacts.current).toBeUndefined();
      expect(missing.results[0]!.artifacts.difference).toBeUndefined();
      await copyFile(original, sample);
      const recovered = await verifyCases(
        renderer,
        await loadCases(root),
        paths,
      );
      expect(recovered.passed, recovered.results[0]!.messages.join("\n")).toBe(
        true,
      );
      const after = await Promise.all([
        readFile(updated.paths.wav),
        readFile(updated.paths.json),
      ]);
      expect(after.every((bytes, index) => bytes.equals(before[index]!))).toBe(
        true,
      );
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
