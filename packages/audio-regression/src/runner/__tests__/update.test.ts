import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { normalizeCase, planRender } from "../../cases";
import type { SketchCase } from "../../types";
import {
  REFERENCE_DIRECTORY,
  readRecording,
  referencePath,
  writeRecording,
} from "../recording";
import {
  expectUnchanged,
  snapshot,
} from "../../__tests__/support/reference-files";
import { parseUpdateSelector, update, updateReference } from "../update";

const sketch: SketchCase = {
  id: "test",
  description: "Unapproved update unit fixture",
  code: "not evaluated by unit renderer",
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
  channels[1]![0] = -0;
  return {
    ...normalized,
    ...layout,
    channels,
    metrics: [],
    browserVersion: "147.0.7727.15",
  };
}

async function withDirectories<T>(
  run: (paths: {
    referenceDirectory: string;
    artifactDirectory: string;
  }) => Promise<T>,
) {
  const directory = await mkdtemp(join(tmpdir(), "audio-update-unit-"));
  try {
    return await run({
      referenceDirectory: join(directory, "references"),
      artifactDirectory: join(directory, "artifacts"),
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("explicit reference updating", () => {
  it("uses matching case folders for default and configured reference trees", () => {
    expect(referencePath("sine")).toBe(
      join(REFERENCE_DIRECTORY, "sine", "render.wav"),
    );
    expect(referencePath("sample-tone", "custom-references")).toBe(
      join("custom-references", "sample-tone", "render.wav"),
    );
  });

  it("requires exactly one named case and rejects all/update flags", () => {
    expect(parseUpdateSelector(["--case", "test"])).toBe("test");
    for (const args of [
      [],
      ["test"],
      ["--case"],
      ["--case", ""],
      ["--all"],
      ["--case", "test", "--case", "other"],
      ["--case", "test", "--update"],
    ])
      expect(() => parseUpdateSelector(args)).toThrow(
        "Usage: audio:update --case <id>",
      );
  });

  it("rejects invalid selection before launching or creating reference paths", async () => {
    await withDirectories(async (paths) => {
      await expect(update([], paths)).rejects.toThrow("Usage");
      await expect(
        update(["--case", "unknown"], { ...paths, registry: [sketch] }),
      ).rejects.toThrow("Unknown case");
      await expect(
        update(["--case", "test"], { ...paths, registry: [] }),
      ).rejects.toThrow("empty");
      await expect(
        update(["--case", "test"], { ...paths, registry: [sketch, sketch] }),
      ).rejects.toThrow("Duplicate");
      await expect(readdir(paths.referenceDirectory)).rejects.toMatchObject({
        code: "ENOENT",
      });
    });
  });

  it("creates only the selected reference after fresh rendering and retains above-one/signed-zero values", async () => {
    await withDirectories(async (paths) => {
      const other = { ...sketch, id: "other" };
      const rendered = recording();
      const renderer = {
        render: vi.fn(async () => {
          await expect(readdir(paths.referenceDirectory)).rejects.toMatchObject(
            { code: "ENOENT" },
          );
          return rendered;
        }),
      };
      const result = await updateReference(
        renderer,
        [sketch, other],
        "test",
        paths,
      );
      expect(renderer.render).toHaveBeenCalledOnce();
      expect(await readdir(paths.referenceDirectory)).toEqual(["test"]);
      expect(result.paths.wav).toBe(
        join(paths.referenceDirectory, "test", "render.wav"),
      );
      expect(result.paths.json).toBe(
        join(paths.referenceDirectory, "test", "metadata.json"),
      );
      expect(
        (await snapshot(paths.referenceDirectory)).map(({ name }) => name),
      ).toEqual(["test/metadata.json", "test/render.wav"]);
      const stored = await readRecording(result.paths.wav);
      expect(stored.channels[0]![0]).toBe(1.25);
      expect(Object.is(stored.channels[1]![0], -0)).toBe(true);
    });
  });

  it("replaces only the selected pair and never uses unchanged source as a skip", async () => {
    await withDirectories(async (paths) => {
      const other = { ...sketch, id: "other" };
      await writeRecording(
        referencePath("test", paths.referenceDirectory),
        recording(),
      );
      await writeRecording(
        referencePath("other", paths.referenceDirectory),
        recording(other),
      );
      await writeFile(
        join(paths.referenceDirectory, "other", "notes"),
        "preserve unexpected sibling files",
      );
      const before = await snapshot(paths.referenceDirectory);
      const renderer = { render: vi.fn(async () => recording(sketch, 0.75)) };
      const updated = await updateReference(
        renderer,
        [sketch, other],
        "test",
        paths,
      );
      const after = await snapshot(paths.referenceDirectory);
      expect(after.map(({ name }) => name)).toEqual(
        before.map(({ name }) => name),
      );
      expect(
        after
          .filter(({ name }) => name.startsWith("other/"))
          .every(({ name, bytes }) =>
            bytes.equals(before.find((entry) => entry.name === name)!.bytes),
          ),
      ).toBe(true);
      expect((await readRecording(updated.paths.wav)).channels[0]![0]).toBe(
        0.75,
      );
      await updateReference(renderer, [sketch, other], "test", paths);
      expect(renderer.render).toHaveBeenCalledTimes(2);
    });
  });

  it("preserves every old byte and never creates missing references on render failure", async () => {
    await withDirectories(async (paths) => {
      await writeRecording(
        referencePath("test", paths.referenceDirectory),
        recording(),
      );
      const before = await snapshot(paths.referenceDirectory);
      const renderer = {
        render: async () => {
          throw new Error("deliberate rendering failure");
        },
      };
      await expect(
        updateReference(renderer, [sketch], "test", paths),
      ).rejects.toThrow("deliberate rendering failure");
      await expectUnchanged(paths.referenceDirectory, before);
      const absent = join(paths.referenceDirectory, "absent");
      await expect(
        updateReference(renderer, [sketch], "test", {
          referenceDirectory: absent,
        }),
      ).rejects.toThrow("deliberate rendering failure");
      await expect(readdir(absent)).rejects.toMatchObject({ code: "ENOENT" });
    });
  });

  it.each(["id", "metadata", "shape", "nan", "silent", "ragged"])(
    "validates %s before replacing old recordings",
    async (failure) => {
      await withDirectories(async (paths) => {
        await writeRecording(
          referencePath("test", paths.referenceDirectory),
          recording(),
        );
        const before = await snapshot(paths.referenceDirectory);
        const invalid = recording();
        if (failure === "id") invalid.id = "wrong";
        if (failure === "metadata") invalid.browserVersion = "";
        if (failure === "shape") invalid.frameCount += 1;
        if (failure === "nan") invalid.channels[0]![3] = NaN;
        if (failure === "silent")
          invalid.channels.forEach((channel) => channel.fill(0));
        if (failure === "ragged") invalid.channels[1] = new Float32Array(3);
        await expect(
          updateReference(
            { render: async () => invalid },
            [sketch],
            "test",
            paths,
          ),
        ).rejects.toThrow();
        await expectUnchanged(paths.referenceDirectory, before);
      });
    },
  );

  it("allows exact silence only for opted-in cases", async () => {
    await withDirectories(async (paths) => {
      const input = { ...sketch, expectSilence: true };
      const result = await updateReference(
        { render: async () => recording(input, 0) },
        [input],
        "test",
        paths,
      );
      expect(
        (await readRecording(result.paths.wav)).channels.every((channel) =>
          channel.every((value) => value === 0),
        ),
      ).toBe(true);
      const before = await snapshot(paths.referenceDirectory);
      await expect(
        updateReference(
          { render: async () => recording(input) },
          [input],
          "test",
          paths,
        ),
      ).rejects.toThrow("Expected silence");
      await expectUnchanged(paths.referenceDirectory, before);
    });
  });

  it("reports filesystem errors instead of claiming a successful update", async () => {
    await withDirectories(async (paths) => {
      await writeFile(paths.referenceDirectory, "not a directory");
      await expect(
        updateReference(
          { render: async () => recording() },
          [sketch],
          "test",
          paths,
        ),
      ).rejects.toThrow();
    });
  });
});
