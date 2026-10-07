import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { normalizeCase, planRender } from "../../cases";
import type { SketchCase } from "../../types";
import { readRecording, referencePath, writeRecording } from "../recording";
import {
  expectUnchanged,
  snapshot,
} from "../../__tests__/support/reference-files";
import { parseVerifySelector, verify, verifyCases } from "../verify";

const sketch: SketchCase = {
  id: "test",
  description: "Temporary verification fixture",
  code: "unused by unit renderer",
  bars: 1,
  tailSeconds: 0,
  settings: { sampleRate: 3000, channels: 2, startOffsetFrames: 0 },
};

function recording(input = sketch, value = 1.25) {
  const normalized = normalizeCase(input);
  const layout = planRender(normalized);
  return {
    ...normalized,
    ...layout,
    channels: Array.from({ length: normalized.settings.channels }, () =>
      new Float32Array(layout.frameCount).fill(value),
    ),
    metrics: [],
    browserVersion: "test-browser",
  };
}

async function withDirectories<T>(
  run: (paths: {
    referenceDirectory: string;
    artifactDirectory: string;
  }) => Promise<T>,
) {
  const directory = await mkdtemp(join(tmpdir(), "audio-verify-unit-"));
  try {
    return await run({
      referenceDirectory: join(directory, "references"),
      artifactDirectory: join(directory, "artifacts"),
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("read-only verification", () => {
  it("accepts all/one selection, rejecting invalid arguments and empty/duplicate/unknown coverage", async () => {
    expect(parseVerifySelector([])).toBeUndefined();
    expect(parseVerifySelector(["--case", "test"])).toBe("test");
    for (const args of [
      ["test"],
      ["--case"],
      ["--case", ""],
      ["--update"],
      ["--case", "test", "extra"],
    ])
      expect(() => parseVerifySelector(args)).toThrow();
    await expect(verify([], { registry: [] })).rejects.toThrow();
    await expect(verify([], { registry: [sketch, sketch] })).rejects.toThrow();
    await expect(
      verify(["--case", "unknown"], { registry: [sketch] }),
    ).rejects.toThrow();
  });

  it("rejects overlapping artifact/reference trees before cleanup or rendering", async () => {
    await withDirectories(async (paths) => {
      await writeRecording(
        referencePath("test", paths.referenceDirectory),
        recording(),
      );
      const before = await snapshot(paths.referenceDirectory);
      const renderer = { render: vi.fn(async () => recording()) };
      for (const [referenceDirectory, artifactDirectory] of [
        [paths.referenceDirectory, paths.referenceDirectory],
        [paths.referenceDirectory, join(paths.referenceDirectory, "nested")],
        [join(paths.referenceDirectory, "nested"), paths.referenceDirectory],
      ])
        await expect(
          verifyCases(renderer, [sketch], {
            referenceDirectory,
            artifactDirectory,
          }),
        ).rejects.toThrow();
      expect(renderer.render).not.toHaveBeenCalled();
      await expectUnchanged(paths.referenceDirectory, before);
    });
  });

  it("renders every invocation, ignores provenance as a gate, and cleans only selected artifacts", async () => {
    await withDirectories(async (paths) => {
      const other = { ...sketch, id: "other" };
      for (const input of [sketch, other])
        await writeRecording(
          referencePath(input.id, paths.referenceDirectory),
          recording(input),
        );
      const before = await snapshot(paths.referenceDirectory);
      const renderer = {
        render: vi.fn(async (input: SketchCase) => ({
          ...recording(input),
          browserVersion: "different-browser",
        })),
      };
      expect((await verifyCases(renderer, [sketch, other], paths)).passed).toBe(
        true,
      );
      for (const id of ["test", "other"]) {
        await mkdir(join(paths.artifactDirectory, id), { recursive: true });
        await writeFile(join(paths.artifactDirectory, id, "sentinel"), "stale");
      }
      const selected = await verifyCases(renderer, [sketch, other], {
        ...paths,
        caseId: "test",
      });
      expect(selected.passed).toBe(true);
      expect(selected.results.map(({ id }) => id)).toEqual(["test"]);
      expect(renderer.render.mock.calls.map(([input]) => input.id)).toEqual([
        "test",
        "other",
        "test",
      ]);
      await expect(
        readdir(join(paths.artifactDirectory, "test")),
      ).rejects.toMatchObject({ code: "ENOENT" });
      expect(
        await readFile(
          join(paths.artifactDirectory, "other", "sentinel"),
          "utf8",
        ),
      ).toBe("stale");
      await expectUnchanged(paths.referenceDirectory, before);
    });
  });

  it("saves original A/B and signed current-minus-reference differences without changing references", async () => {
    await withDirectories(async (paths) => {
      const original = recording();
      await writeRecording(
        referencePath("test", paths.referenceDirectory),
        original,
      );
      const before = await snapshot(paths.referenceDirectory);
      const current = recording();
      current.channels[0]![11] = -0.75;
      const result = await verifyCases(
        { render: async () => current },
        [sketch],
        paths,
      );
      expect(result.passed).toBe(false);
      expect(result.results[0]!.comparison?.worst).toMatchObject({
        channel: 0,
        frame: 11,
      });
      const artifacts = result.results[0]!.artifacts;
      const a = await readRecording(artifacts.reference!.wav);
      const b = await readRecording(artifacts.current!.wav);
      const difference = await readRecording(artifacts.difference!.wav);
      expect(a.channels).toEqual(original.channels);
      expect(b.channels).toEqual(current.channels);
      expect(difference.channels[0]![11]).toBe(-2);
      expect(difference.channels[1]!.every((value) => value === 0)).toBe(true);
      await expectUnchanged(paths.referenceDirectory, before);
    });
  });

  it.each([
    { settings: { sampleRate: 6000 } },
    { settings: { channels: 1 } },
    { bars: 2 },
  ])(
    "saves A/B but no fabricated difference for incompatible shape %j",
    async (change) => {
      await withDirectories(async (paths) => {
        await writeRecording(
          referencePath("test", paths.referenceDirectory),
          recording(),
        );
        const input = {
          ...sketch,
          ...change,
          settings: { ...sketch.settings, ...change.settings },
        };
        const result = await verifyCases(
          { render: async () => recording(input) },
          [input],
          paths,
        );
        expect(result.passed).toBe(false);
        expect(result.results[0]!.artifacts.reference).toBeDefined();
        expect(result.results[0]!.artifacts.current).toBeDefined();
        expect(result.results[0]!.artifacts.difference).toBeUndefined();
      });
    },
  );

  it.each(["missing", "corrupt", "wrong-id"])(
    "fails %s references without creating/replacing coverage",
    async (failure) => {
      await withDirectories(async (paths) => {
        const stored = await writeRecording(
          referencePath("test", paths.referenceDirectory),
          recording(),
        );
        if (failure === "missing") await rm(stored.wav);
        if (failure === "corrupt") await writeFile(stored.json, "{broken");
        if (failure === "wrong-id")
          await writeRecording(
            stored.wav,
            recording({ ...sketch, id: "wrong" }),
          );
        const before = await snapshot(paths.referenceDirectory);
        const renderer = { render: vi.fn(async () => recording()) };
        const result = await verifyCases(renderer, [sketch], paths);
        expect(result.passed).toBe(false);
        expect(renderer.render).toHaveBeenCalledOnce();
        expect(Object.keys(result.results[0]!.artifacts)).toEqual(["current"]);
        await expectUnchanged(paths.referenceDirectory, before);
      });
    },
  );

  it("rejects render errors without partial/stale current audio and continues later cases", async () => {
    await withDirectories(async (paths) => {
      const next = { ...sketch, id: "next" };
      for (const input of [sketch, next])
        await writeRecording(
          referencePath(input.id, paths.referenceDirectory),
          recording(input),
        );
      const before = await snapshot(paths.referenceDirectory);
      await mkdir(join(paths.artifactDirectory, "test"), { recursive: true });
      await writeFile(
        join(paths.artifactDirectory, "test", "current.wav"),
        "stale",
      );
      const result = await verifyCases(
        {
          render: async (input) => {
            if (input.id === "test") throw new Error("render failure");
            return recording(input);
          },
        },
        [sketch, next],
        paths,
      );
      expect(result.passed).toBe(false);
      expect(result.results.map(({ passed }) => passed)).toEqual([false, true]);
      expect(Object.keys(result.results[0]!.artifacts)).toEqual(["reference"]);
      await expect(
        readFile(join(paths.artifactDirectory, "test", "current.wav")),
      ).rejects.toMatchObject({ code: "ENOENT" });
      await expectUnchanged(paths.referenceDirectory, before);
    });
  });

  it("preserves legal A/B when Float32 subtraction overflows instead of clipping a difference", async () => {
    await withDirectories(async (paths) => {
      const largest = Float32Array.of(3.4028234663852886e38)[0]!;
      await writeRecording(
        referencePath("test", paths.referenceDirectory),
        recording(sketch, largest),
      );
      const result = await verifyCases(
        { render: async () => recording(sketch, -largest) },
        [sketch],
        paths,
      );
      expect(result.passed).toBe(false);
      expect(result.results[0]!.artifacts.difference).toBeUndefined();
      expect(
        (await readRecording(result.results[0]!.artifacts.current!.wav))
          .channels[0]![0],
      ).toBe(-largest);
    });
  });

  it("passes opted-in silence", async () => {
    await withDirectories(async (paths) => {
      const input = { ...sketch, expectSilence: true };
      await writeRecording(
        referencePath("test", paths.referenceDirectory),
        recording(input, 0),
      );
      expect(
        (
          await verifyCases(
            { render: async () => recording(input, 0) },
            [input],
            paths,
          )
        ).passed,
      ).toBe(true);
    });
  });

  it("fails artifact I/O without skipping rendering or modifying references", async () => {
    await withDirectories(async (paths) => {
      await writeRecording(
        referencePath("test", paths.referenceDirectory),
        recording(),
      );
      const before = await snapshot(paths.referenceDirectory);
      await writeFile(paths.artifactDirectory, "not a directory");
      const renderer = { render: vi.fn(async () => recording()) };
      const result = await verifyCases(renderer, [sketch], paths);
      expect(result.passed).toBe(false);
      expect(renderer.render).toHaveBeenCalledOnce();
      expect(result.results[0]!.comparison?.passed).toBe(true);
      expect(result.results[0]!.errors.length).toBeGreaterThan(0);
      await expectUnchanged(paths.referenceDirectory, before);
    });
  });
});
