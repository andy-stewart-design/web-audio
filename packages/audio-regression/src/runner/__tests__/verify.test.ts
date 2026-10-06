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
import { inspectAudio } from "../audio";
import { readRecording, writeRecording } from "../recording";
import { parseVerifySelector, verify, verifyCases } from "../verify";

const sketch: SketchCase = {
  id: "test",
  description: "Unapproved verification unit fixture",
  code: "unused by unit renderer",
  bars: 1,
  tailSeconds: 0,
  settings: { sampleRate: 3000, channels: 2, startOffsetFrames: 0 },
};

function recording(input = sketch, value = 1.25) {
  const normalized = normalizeCase(input);
  const layout = planRender(normalized);
  const channels = Array.from({ length: normalized.settings.channels }, () =>
    new Float32Array(layout.frameCount).fill(value),
  );
  return {
    ...normalized,
    ...layout,
    channels,
    metrics: inspectAudio(channels, normalized.expectSilence),
    browserVersion: "147.0.7727.15",
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

async function referenceBytes(directory: string, id = "test") {
  return Promise.all([
    readFile(join(directory, `${id}.wav`)),
    readFile(join(directory, `${id}.json`)),
  ]);
}

async function expectUnchanged(
  directory: string,
  before: Buffer[],
  id = "test",
) {
  const after = await referenceBytes(directory, id);
  expect(after.every((bytes, index) => bytes.equals(before[index]!))).toBe(
    true,
  );
}

const outputOf = (result: Awaited<ReturnType<typeof verifyCases>>) =>
  result.results.flatMap((entry) => entry.messages).join("\n");

describe("read-only verification orchestration", () => {
  it("strictly parses an optional single selector", () => {
    expect(parseVerifySelector([])).toBeUndefined();
    expect(parseVerifySelector(["--case", "test"])).toBe("test");
    for (const args of [
      ["test"],
      ["--case"],
      ["--case", ""],
      ["--update"],
      ["--case", "test", "--case", "other"],
    ])
      expect(() => parseVerifySelector(args)).toThrow(
        "Usage: audio:verify [--case <id>]",
      );
  });

  it("rejects empty/duplicate registries and unknown selectors before launching a browser", async () => {
    for (const [registry, args, message] of [
      [[], [], "Case registry is empty"],
      [[sketch, sketch], [], "Duplicate case ID"],
      [[sketch], ["--case", "unknown"], "Unknown case"],
    ] as const) {
      await expect(
        verify([...args], { registry: [...registry] }),
      ).rejects.toThrow(message);
    }
    await expect(verify(["--update"])).rejects.toThrow("Usage");
  });

  it("rejects overlapping reference/artifact trees before any cleanup or rendering", async () => {
    await withDirectories(async (paths) => {
      await writeRecording(
        join(paths.referenceDirectory, "test.wav"),
        recording(),
      );
      const before = await referenceBytes(paths.referenceDirectory);
      const renderer = {
        render: vi.fn(async (input: SketchCase) => recording(input)),
      };
      for (const [referenceDirectory, artifactDirectory] of [
        [paths.referenceDirectory, paths.referenceDirectory],
        [paths.referenceDirectory, join(paths.referenceDirectory, "nested")],
        [join(paths.referenceDirectory, "nested"), paths.referenceDirectory],
      ]) {
        await expect(
          verifyCases(renderer, [sketch], {
            referenceDirectory,
            artifactDirectory,
          }),
        ).rejects.toThrow("non-overlapping");
      }
      expect(renderer.render).not.toHaveBeenCalled();
      await expectUnchanged(paths.referenceDirectory, before);
    });
  });

  it("renders all or selected cases on every invocation, warns without gating on browser changes, and clears stale selected artifacts", async () => {
    await withDirectories(async (paths) => {
      const other = { ...sketch, id: "other" };
      for (const input of [sketch, other])
        await writeRecording(
          join(paths.referenceDirectory, `${input.id}.wav`),
          recording(input),
        );
      const before = await referenceBytes(paths.referenceDirectory);
      await mkdir(join(paths.artifactDirectory, "test"), { recursive: true });
      await writeFile(
        join(paths.artifactDirectory, "test", "current.wav"),
        "stale",
      );
      const renderer = {
        render: vi.fn(async (input: SketchCase) => ({
          ...recording(input),
          browserVersion: "999.0.0.0",
        })),
      };
      const report = vi.fn();
      const all = await verifyCases(renderer, [sketch, other], {
        ...paths,
        report,
      });
      expect(all.passed).toBe(true);
      expect(all.results.map(({ id }) => id)).toEqual(["test", "other"]);
      expect(outputOf(all)).toContain("Warning: browser version changed");
      expect(outputOf(all)).toContain("Thresholds: max <= 0, RMS <= 0");
      expect(report).toHaveBeenLastCalledWith(
        "Audio verification passed: 2/2 cases passed. References were not updated.",
      );
      await expect(
        readdir(join(paths.artifactDirectory, "test")),
      ).rejects.toMatchObject({ code: "ENOENT" });
      await mkdir(join(paths.artifactDirectory, "other"), { recursive: true });
      await writeFile(
        join(paths.artifactDirectory, "other", "sentinel"),
        "unselected",
      );
      const selected = await verifyCases(renderer, [sketch, other], {
        ...paths,
        caseId: "test",
      });
      expect(selected.passed).toBe(true);
      expect(selected.results).toHaveLength(1);
      expect(
        await readFile(
          join(paths.artifactDirectory, "other", "sentinel"),
          "utf8",
        ),
      ).toBe("unselected");
      expect(renderer.render.mock.calls.map(([input]) => input.id)).toEqual([
        "test",
        "other",
        "test",
      ]);
      await expectUnchanged(paths.referenceDirectory, before);
    });
  });

  it("saves raw A/B and signed current-minus-reference differences without changing references or inputs", async () => {
    await withDirectories(async (paths) => {
      const original = recording();
      await writeRecording(
        join(paths.referenceDirectory, "test.wav"),
        original,
      );
      const before = await referenceBytes(paths.referenceDirectory);
      const current = recording();
      current.channels[0]![11] = -0.75;
      const result = await verifyCases(
        { render: async () => current },
        [sketch],
        paths,
      );
      expect(result.passed).toBe(false);
      expect(outputOf(result)).toContain("Worst error: channel 0, frame 11");
      expect(outputOf(result)).toContain(
        "Difference sign: current - reference",
      );
      const artifacts = result.results[0]!.artifacts;
      const a = await readRecording(artifacts.reference!.wav);
      const b = await readRecording(artifacts.current!.wav);
      const difference = await readRecording(artifacts.difference!.wav);
      expect(a.channels[0]![11]).toBe(1.25);
      expect(b.channels[0]![11]).toBe(-0.75);
      expect(difference.channels[0]![11]).toBe(-2);
      expect(difference.channels[1]!.every((value) => value === 0)).toBe(true);
      expect(current.channels[0]![11]).toBe(-0.75);
      expect(original.channels[0]![11]).toBe(1.25);
      await expectUnchanged(paths.referenceDirectory, before);
    });
  });

  it.each([{ sampleRate: 6000 }, { channels: 1 }, { bars: 2 }])(
    "saves A/B but never fabricates differences for incompatible shapes %j",
    async (change) => {
      await withDirectories(async (paths) => {
        await writeRecording(
          join(paths.referenceDirectory, "test.wav"),
          recording(),
        );
        const input = {
          ...sketch,
          bars: change.bars ?? 1,
          settings: {
            ...sketch.settings,
            ...("sampleRate" in change
              ? { sampleRate: change.sampleRate }
              : {}),
            ...("channels" in change ? { channels: change.channels } : {}),
          },
        };
        const result = await verifyCases(
          { render: async () => recording(input) },
          [input],
          paths,
        );
        expect(result.passed).toBe(false);
        expect(outputOf(result)).toContain("Comparison failed:");
        expect(outputOf(result)).toContain(
          "Difference unavailable: audio shapes differ",
        );
        expect(result.results[0]!.artifacts.reference).toBeDefined();
        expect(result.results[0]!.artifacts.current).toBeDefined();
        expect(result.results[0]!.artifacts.difference).toBeUndefined();
      });
    },
  );

  it.each([
    "wav-missing",
    "json-missing",
    "wav-corrupt",
    "json-corrupt",
    "id-mismatch",
  ])(
    "renders and saves current-only for unavailable reference: %s",
    async (failure) => {
      await withDirectories(async (paths) => {
        const wav = join(paths.referenceDirectory, "test.wav");
        const stored = await writeRecording(wav, recording());
        if (failure === "wav-missing") await rm(stored.wav);
        if (failure === "json-missing") await rm(stored.json);
        if (failure === "wav-corrupt") await writeFile(stored.wav, "broken");
        if (failure === "json-corrupt") await writeFile(stored.json, "{broken");
        if (failure === "id-mismatch")
          await writeFile(
            stored.json,
            JSON.stringify({
              ...recording(),
              channels: undefined,
              id: "wrong",
            }),
          );
        const names = (await readdir(paths.referenceDirectory)).sort();
        const before = await Promise.all(
          names.map((name) => readFile(join(paths.referenceDirectory, name))),
        );
        const renderer = { render: vi.fn(async () => recording()) };
        const result = await verifyCases(renderer, [sketch], paths);
        expect((await readdir(paths.referenceDirectory)).sort()).toEqual(names);
        const after = await Promise.all(
          names.map((name) => readFile(join(paths.referenceDirectory, name))),
        );
        expect(
          after.every((bytes, index) => bytes.equals(before[index]!)),
        ).toBe(true);
        expect(result.passed).toBe(false);
        expect(renderer.render).toHaveBeenCalledOnce();
        expect(outputOf(result)).toContain(
          "Reference unavailable (missing or invalid)",
        );
        expect(result.results[0]!.artifacts.current).toBeDefined();
        expect(result.results[0]!.artifacts.reference).toBeUndefined();
        expect(result.results[0]!.artifacts.difference).toBeUndefined();
        expect(
          (await readRecording(result.results[0]!.artifacts.current!.wav))
            .metadata.id,
        ).toBe("test");
      });
    },
  );

  it("reports render errors without invented current audio, cleans stale failures, and continues later cases", async () => {
    await withDirectories(async (paths) => {
      await writeRecording(
        join(paths.referenceDirectory, "test.wav"),
        recording(),
      );
      const before = await referenceBytes(paths.referenceDirectory);
      await mkdir(join(paths.artifactDirectory, "test"), { recursive: true });
      await writeFile(
        join(paths.artifactDirectory, "test", "current.wav"),
        "stale",
      );
      const renderer = {
        render: vi.fn(async (input: SketchCase) => {
          if (input.id === "test") throw new Error("deliberate render failure");
          return recording(input);
        }),
      };
      const result = await verifyCases(
        renderer,
        [sketch, { ...sketch, id: "next" }],
        paths,
      );
      expect(result.passed).toBe(false);
      expect(renderer.render).toHaveBeenCalledTimes(2);
      expect(outputOf(result)).toContain("deliberate render failure");
      expect(outputOf(result)).toContain("No current recording:");
      expect(result.results[0]!.artifacts.current).toBeUndefined();
      expect(result.results[0]!.artifacts.reference).toBeDefined();
      expect(result.results[1]!.artifacts.current).toBeDefined();
      await expect(
        readFile(join(paths.artifactDirectory, "test", "current.wav")),
      ).rejects.toMatchObject({ code: "ENOENT" });
      await expectUnchanged(paths.referenceDirectory, before);
    });
  });

  it("rejects an unrepresentable Float32 difference instead of clipping while preserving legal A/B amplitudes", async () => {
    await withDirectories(async (paths) => {
      const largest = new Float32Array([3.4028234663852886e38])[0]!;
      await writeRecording(
        join(paths.referenceDirectory, "test.wav"),
        recording(sketch, largest),
      );
      const result = await verifyCases(
        { render: async () => recording(sketch, -largest) },
        [sketch],
        paths,
      );
      expect(result.passed).toBe(false);
      expect(outputOf(result)).toContain("non-finite Float32 difference");
      expect(result.results[0]!.artifacts.difference).toBeUndefined();
      expect(
        (await readRecording(result.results[0]!.artifacts.current!.wav))
          .channels[0]![0],
      ).toBe(-largest);
    });
  });

  it("passes explicitly silent references using the case's exact-silence policy", async () => {
    await withDirectories(async (paths) => {
      const input = { ...sketch, expectSilence: true };
      const silent = recording(input, 0);
      await writeRecording(join(paths.referenceDirectory, "test.wav"), silent);
      const result = await verifyCases(
        { render: async () => silent },
        [input],
        paths,
      );
      expect(result.passed).toBe(true);
      expect(result.results[0]!.comparison?.worst).toBeNull();
    });
  });

  it("reports artifact write failures and still attempts remaining recordings", async () => {
    await withDirectories(async (paths) => {
      await writeRecording(
        join(paths.referenceDirectory, "test.wav"),
        recording(),
      );
      const before = await referenceBytes(paths.referenceDirectory);
      const renderer = {
        render: async () => {
          await mkdir(join(paths.artifactDirectory, "test", "current.wav"), {
            recursive: true,
          });
          return recording(sketch, 0.75);
        },
      };
      const result = await verifyCases(renderer, [sketch], paths);
      expect(result.passed).toBe(false);
      expect(outputOf(result)).toContain("Could not save current artifact:");
      expect(result.results[0]!.artifacts.current).toBeUndefined();
      expect(result.results[0]!.artifacts.reference).toBeDefined();
      expect(result.results[0]!.artifacts.difference).toBeDefined();
      await expectUnchanged(paths.referenceDirectory, before);
    });
  });

  it("reports artifact filesystem errors without skipping rendering or touching references", async () => {
    await withDirectories(async (paths) => {
      await writeRecording(
        join(paths.referenceDirectory, "test.wav"),
        recording(),
      );
      const before = await referenceBytes(paths.referenceDirectory);
      await writeFile(paths.artifactDirectory, "not a directory");
      const renderer = { render: vi.fn(async () => recording()) };
      const result = await verifyCases(renderer, [sketch], paths);
      expect(result.passed).toBe(false);
      expect(renderer.render).toHaveBeenCalledOnce();
      expect(result.results[0]!.comparison?.passed).toBe(true);
      expect(outputOf(result)).toContain(
        "Could not clear stale failure artifacts",
      );
      await expectUnchanged(paths.referenceDirectory, before);
    });
  });
});
