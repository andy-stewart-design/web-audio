import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cases, selectCase } from "../cases";
import type { SketchCase } from "../types";
import { readRecording, writeRecording } from "../runner/recording";
import { withRenderer } from "../runner/render";
import { verifyCases } from "../runner/verify";
import { sketch } from "./support/cases";

async function withDirectories<T>(
  run: (paths: {
    referenceDirectory: string;
    artifactDirectory: string;
  }) => Promise<T>,
) {
  const directory = await mkdtemp(join(tmpdir(), "audio-verify-native-"));
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

const sameSamples = (a: readonly Float32Array[], b: typeof a) =>
  a.length === b.length &&
  a.every(
    (channel, index) =>
      channel.length === b[index]?.length &&
      channel.every((value, frame) => Object.is(value, b[index]![frame])),
  );

describe("native read-only verification and failure recordings", () => {
  it("verifies all six registered synth/sample/LFO cases at 0/0, then always renders a selected case again", async () => {
    await withDirectories(async (paths) => {
      await withRenderer(async (renderer) => {
        for (const input of cases)
          await writeRecording(
            join(paths.referenceDirectory, `${input.id}.wav`),
            await renderer.render(input),
          );
        const before = await snapshot(paths.referenceDirectory);
        const all = await verifyCases(renderer, cases, paths);
        expect(all.passed).toBe(true);
        expect(all.results).toHaveLength(6);
        expect(
          all.results.every(({ comparison }) =>
            comparison?.channels.every(
              ({ maxError, rmsError }) => maxError === 0 && rmsError === 0,
            ),
          ),
        ).toBe(true);
        const selected = await verifyCases(renderer, cases, {
          ...paths,
          caseId: "sample-alternate",
        });
        expect(selected.passed).toBe(true);
        expect(selected.results.map(({ id }) => id)).toEqual([
          "sample-alternate",
        ]);
        await expectUnchanged(paths.referenceDirectory, before);
        expect(renderer.browser.contexts()).toHaveLength(0);
      });
    });
  });

  it("rejects a real gain change, records exact A/B and signed differences, then clears stale failure audio on a passing rerun", async () => {
    await withDirectories(async (paths) => {
      await withRenderer(async (renderer) => {
        const original = await renderer.render(sketch());
        await writeRecording(
          join(paths.referenceDirectory, "sine.wav"),
          original,
        );
        const before = await snapshot(paths.referenceDirectory);
        const changed = sketch({
          code: sketch().code.replace("gain(0.5)", "gain(0.55)"),
        });
        const result = await verifyCases(renderer, [changed], paths);
        const failed = result.results[0]!;
        expect(result.passed).toBe(false);
        expect(failed.comparison?.worst?.error).toBeGreaterThan(0.01);
        expect(failed.messages.join("\n")).toContain(
          "Thresholds: max <= 0, RMS <= 0",
        );
        const a = await readRecording(failed.artifacts.reference!.wav);
        const b = await readRecording(failed.artifacts.current!.wav);
        const difference = await readRecording(
          failed.artifacts.difference!.wav,
        );
        expect(sameSamples(a.channels, original.channels)).toBe(true);
        expect(sameSamples(a.channels, b.channels)).toBe(false);
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
        const healthy = await verifyCases(renderer, [sketch()], paths);
        expect(healthy.passed).toBe(true);
        await expect(
          readdir(join(paths.artifactDirectory, "sine")),
        ).rejects.toMatchObject({ code: "ENOENT" });
        await expectUnchanged(paths.referenceDirectory, before);
        expect(renderer.browser.contexts()).toHaveLength(0);
      });
    });
  });

  it("fails real evaluation and sample loading without accepting partial audio, preserves references and continues to a healthy case", async () => {
    await withDirectories(async (paths) => {
      await withRenderer(async (renderer) => {
        const original = await renderer.render(sketch());
        for (const id of ["evaluation", "missing-sample", "sine"])
          await writeRecording(join(paths.referenceDirectory, `${id}.wav`), {
            ...original,
            id,
          });
        const before = await snapshot(paths.referenceDirectory);
        const registry: SketchCase[] = [
          sketch({
            id: "evaluation",
            code: "throw new Error('deliberate verification evaluation failure');",
          }),
          sketch({
            id: "missing-sample",
            code: `${sketch().code} d.loadSamples({bank: 'local', samples: {tone: ['/samples/absent.wav']}}); d.sample('tone').bank('local').push();`,
          }),
          sketch(),
        ];
        const result = await verifyCases(renderer, registry, paths);
        expect(result.passed).toBe(false);
        expect(result.results.map(({ passed }) => passed)).toEqual([
          false,
          false,
          true,
        ]);
        expect(result.results[0]!.messages.join("\n")).toContain(
          "deliberate verification evaluation failure",
        );
        expect(result.results[1]!.messages.join("\n")).toContain(
          "Failed to load",
        );
        for (const entry of result.results.slice(0, 2)) {
          expect(entry.artifacts.reference).toBeDefined();
          expect(entry.artifacts.current).toBeUndefined();
          expect(entry.artifacts.difference).toBeUndefined();
          expect(entry.messages.join("\n")).toContain("No current recording");
        }
        await expectUnchanged(paths.referenceDirectory, before);
        expect(renderer.browser.contexts()).toHaveLength(0);
      });
    });
  });

  it("fails missing coverage but still renders a real sampler and saves current-only audio without creating references", async () => {
    await withDirectories(async (paths) => {
      await withRenderer(async (renderer) => {
        const result = await verifyCases(
          renderer,
          [selectCase(cases, "sample-tone")],
          paths,
        );
        expect(result.passed).toBe(false);
        const entry = result.results[0]!;
        expect(entry.messages.join("\n")).toContain("ENOENT");
        expect(entry.artifacts.reference).toBeUndefined();
        expect(entry.artifacts.difference).toBeUndefined();
        const stored = await readRecording(entry.artifacts.current!.wav);
        expect(stored.frameCount).toBe(105_600);
        expect(
          stored.channels.some((channel) =>
            channel.some((value) => value !== 0),
          ),
        ).toBe(true);
        await expect(readdir(paths.referenceDirectory)).rejects.toMatchObject({
          code: "ENOENT",
        });
        expect(renderer.browser.contexts()).toHaveLength(0);
      });
    });
  });
});
