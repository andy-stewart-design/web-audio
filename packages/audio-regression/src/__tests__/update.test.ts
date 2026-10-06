import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cases, selectCase } from "../cases";
import { readRecording } from "../runner/recording";
import { withRenderer } from "../runner/render";
import { update, updateReference } from "../runner/update";
import { verifyCases } from "../runner/verify";
import { sketch } from "./support/cases";
import {
  throwingProcessor,
  withBrokenWorklet,
} from "./support/worklet-failures";

async function withDirectories<T>(
  run: (paths: {
    referenceDirectory: string;
    artifactDirectory: string;
  }) => Promise<T>,
) {
  const directory = await mkdtemp(join(tmpdir(), "audio-update-native-"));
  try {
    return await run({
      referenceDirectory: join(directory, "references"),
      artifactDirectory: join(directory, "artifacts"),
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function snapshot(directory: string) {
  const names = (await readdir(directory)).sort();
  return Promise.all(
    names.map(async (name) => ({
      name,
      bytes: await readFile(join(directory, name)),
    })),
  );
}

async function expectUnchanged(
  directory: string,
  before: Awaited<ReturnType<typeof snapshot>>,
) {
  const after = await snapshot(directory);
  expect(after.map(({ name }) => name)).toEqual(before.map(({ name }) => name));
  expect(
    after.every(({ bytes }, index) => bytes.equals(before[index]!.bytes)),
  ).toBe(true);
}

describe("real-engine explicit reference update workflow", () => {
  it("creates native synth/sample references, verifies read-only, replaces only the selected gain/settings and verifies the intended replacement", async () => {
    await withDirectories(async (paths) => {
      await withRenderer(async (renderer) => {
        const registry = [sketch(), selectCase(cases, "sample-tone")];
        for (const input of registry)
          await updateReference(renderer, registry, input.id, paths);
        const before = await snapshot(paths.referenceDirectory);
        const all = await verifyCases(renderer, registry, paths);
        expect(all.passed).toBe(true);
        await expectUnchanged(paths.referenceDirectory, before);
        const changed = sketch({
          code: sketch().code.replace("gain(0.5)", "gain(0.55)"),
          tailSeconds: 0.3,
        });
        const replacement = await updateReference(
          renderer,
          [changed, registry[1]!],
          "sine",
          paths,
        );
        const after = await snapshot(paths.referenceDirectory);
        expect(after.map(({ name }) => name)).toEqual(
          before.map(({ name }) => name),
        );
        expect(
          after
            .filter(({ name }) => name.startsWith("sample-tone."))
            .every(({ name, bytes }) =>
              bytes.equals(before.find((entry) => entry.name === name)!.bytes),
            ),
        ).toBe(true);
        expect(
          after
            .find(({ name }) => name === "sine.wav")!
            .bytes.equals(
              before.find(({ name }) => name === "sine.wav")!.bytes,
            ),
        ).toBe(false);
        const stored = await readRecording(replacement.paths.wav);
        expect(stored.metadata.tailSeconds).toBe(0.3);
        expect(stored.frameCount).toBe(115_200);
        const intended = await verifyCases(
          renderer,
          [changed, registry[1]!],
          paths,
        );
        expect(intended.passed).toBe(true);
        await expectUnchanged(paths.referenceDirectory, after);
        const old = await verifyCases(renderer, [sketch()], paths);
        expect(old.passed).toBe(false);
        await expectUnchanged(paths.referenceDirectory, after);
        expect(renderer.browser.contexts()).toHaveLength(0);
      });
    });
  });

  it("preserves every reference byte on real source, loading, worklet and unexpected-silence failures, then recovers", async () => {
    await withDirectories(async (paths) => {
      await withRenderer(async (renderer) => {
        await updateReference(renderer, [sketch()], "sine", paths);
        const before = await snapshot(paths.referenceDirectory);
        const failures = [
          [
            sketch({
              code: "throw new Error('deliberate update evaluation failure');",
            }),
            "deliberate update evaluation failure",
          ],
          [
            sketch({
              code: `${sketch().code} d.loadSamples({bank: 'local', samples: {hit: ['/samples/missing.wav']}}); d.sample('hit').bank('local').push();`,
            }),
            "Failed to load",
          ],
          [
            sketch({
              code: withBrokenWorklet(
                selectCase(cases, "lfo-filter").code,
                throwingProcessor,
              ),
            }),
            "deliberate processor failure",
          ],
          [sketch({ code: "" }), "Expected audible output"],
        ] as const;
        for (const [input, message] of failures) {
          await expect(
            updateReference(renderer, [input], "sine", paths),
          ).rejects.toThrow(message);
          await expectUnchanged(paths.referenceDirectory, before);
          expect(renderer.browser.contexts()).toHaveLength(0);
        }
        const good = await verifyCases(renderer, [sketch()], paths);
        expect(good.passed).toBe(true);
        await expectUnchanged(paths.referenceDirectory, before);
      });
    });
  });

  it("does not create an initial reference on failure and stores explicitly silent native output without altering it", async () => {
    await withDirectories(async (paths) => {
      await withRenderer(async (renderer) => {
        const invalid = sketch({
          code: "throw new Error('invalid first reference');",
        });
        await expect(
          updateReference(renderer, [invalid], "sine", paths),
        ).rejects.toThrow("invalid first reference");
        await expect(readdir(paths.referenceDirectory)).rejects.toMatchObject({
          code: "ENOENT",
        });
        const silent = sketch({ id: "silence", code: "", expectSilence: true });
        const result = await updateReference(
          renderer,
          [silent],
          "silence",
          paths,
        );
        expect(
          (await readRecording(result.paths.wav)).channels.every((channel) =>
            channel.every((value) => value === 0),
          ),
        ).toBe(true);
        expect((await verifyCases(renderer, [silent], paths)).passed).toBe(
          true,
        );
        expect(renderer.browser.contexts()).toHaveLength(0);
      });
    });
  });

  it("bounds a synchronous source hang without overwriting an existing reference and recovers", async () => {
    await withDirectories(async (paths) => {
      await withRenderer(
        async (renderer) => {
          await updateReference(renderer, [sketch()], "sine", paths);
          const before = await snapshot(paths.referenceDirectory);
          const hanging = sketch({ code: "while (true) {}" });
          await expect(
            updateReference(renderer, [hanging], "sine", paths),
          ).rejects.toThrow("Render timed out after 1500 ms");
          await expectUnchanged(paths.referenceDirectory, before);
          expect(renderer.browser.contexts()).toHaveLength(0);
          expect((await verifyCases(renderer, [sketch()], paths)).passed).toBe(
            true,
          );
        },
        { timeoutMs: 1500 },
      );
    });
  });

  it("repeats seeded multi-bar updates in fresh browsers without widening tolerances", async () => {
    await withDirectories(async (paths) => {
      const input = selectCase(cases, "seeded-multibar");
      await update(["--case", input.id], { ...paths, registry: [input] });
      const before = await snapshot(paths.referenceDirectory);
      await update(["--case", input.id], { ...paths, registry: [input] });
      await expectUnchanged(paths.referenceDirectory, before);
      expect(before.map(({ name }) => name)).toEqual([
        "seeded-multibar.json",
        "seeded-multibar.wav",
      ]);
    });
  });
});
