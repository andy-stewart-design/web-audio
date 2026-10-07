import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { readRecording } from "../runner/recording";
import { update } from "../runner/update";
import { verify } from "../runner/verify";
import { sketch } from "./support/cases";

const execute = promisify(execFile);
const entry = fileURLToPath(new URL("../update-cli.ts", import.meta.url));
const driver = fileURLToPath(
  new URL("./support/update-command.ts", import.meta.url),
);
const runDriver = (directory: string, mode: string, ...args: string[]) =>
  execute(process.execPath, [
    "--import",
    "tsx",
    driver,
    directory,
    mode,
    ...args,
  ]);

async function withDirectories<T>(
  run: (paths: {
    referenceDirectory: string;
    artifactDirectory: string;
  }) => Promise<T>,
) {
  const directory = await mkdtemp(join(tmpdir(), "audio-update-command-"));
  try {
    return await run({
      referenceDirectory: join(directory, "references"),
      artifactDirectory: join(directory, "artifacts"),
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function bytes(directory: string) {
  return Promise.all([
    readFile(join(directory, "sine", "render.wav")),
    readFile(join(directory, "sine", "metadata.json")),
  ]);
}

describe("explicit update command exit policy", () => {
  it.each([
    [[], "Usage: audio:update --case <id>"],
    [["--all"], "Usage: audio:update --case <id>"],
    [["--case"], "Usage: audio:update --case <id>"],
    [["--case", "unknown"], "Unknown case: unknown"],
    [
      ["--case", "sine", "--case", "sample-tone"],
      "Usage: audio:update --case <id>",
    ],
    [["--case", "sine", "--update"], "Usage: audio:update --case <id>"],
  ])(
    "actual CLI rejects non-explicit/invalid selection %j with exit 1",
    async (args, message) => {
      await expect(
        execute(process.execPath, ["--import", "tsx", entry, ...args]),
      ).rejects.toMatchObject({
        code: 1,
        stderr: expect.stringContaining(message),
      });
    },
  );

  it("creates and replaces a selected reference in fresh Node/browser commands, then verifies without further writes", async () => {
    await withDirectories(async (paths) => {
      const created = await runDriver(
        paths.referenceDirectory,
        "original",
        "--case",
        "sine",
      );
      expect(created.stdout).toContain(
        "Reference recording written. Not listening approval",
      );
      expect(await readdir(paths.referenceDirectory)).toEqual(["sine"]);
      expect(
        (await readdir(join(paths.referenceDirectory, "sine"))).sort(),
      ).toEqual(["metadata.json", "render.wav"]);
      expect(
        (await verify(["--case", "sine"], { ...paths, registry: [sketch()] }))
          .passed,
      ).toBe(true);
      const before = await bytes(paths.referenceDirectory);
      const replaced = await runDriver(
        paths.referenceDirectory,
        "gain",
        "--case",
        "sine",
      );
      expect(replaced.stdout).toContain(
        `Reference WAV: ${join(paths.referenceDirectory, "sine", "render.wav")}`,
      );
      const after = await bytes(paths.referenceDirectory);
      expect(after[0]!.equals(before[0]!)).toBe(false);
      const stored = await readRecording(
        join(paths.referenceDirectory, "sine", "render.wav"),
      );
      expect(stored.metadata.id).toBe("sine");
      expect(stored.frameCount).toBe(112_800);
      const changed = sketch({
        code: sketch().code.replace("gain(0.5)", "gain(0.55)"),
      });
      expect(
        (await verify(["--case", "sine"], { ...paths, registry: [changed] }))
          .passed,
      ).toBe(true);
      expect(
        (await bytes(paths.referenceDirectory)).every((value, index) =>
          value.equals(after[index]!),
        ),
      ).toBe(true);
    });
  });

  it.each([
    ["evaluation", "deliberate command update failure"],
    ["sample", "Failed to load"],
  ])(
    "propagates %s failure as exit 1 without overwriting old WAV/settings",
    async (mode, message) => {
      await withDirectories(async (paths) => {
        await update(["--case", "sine"], { ...paths, registry: [sketch()] });
        const before = await bytes(paths.referenceDirectory);
        await expect(
          runDriver(paths.referenceDirectory, mode, "--case", "sine"),
        ).rejects.toMatchObject({
          code: 1,
          stderr: expect.stringContaining(message),
        });
        expect(
          (await bytes(paths.referenceDirectory)).every((value, index) =>
            value.equals(before[index]!),
          ),
        ).toBe(true);
      });
    },
  );
});
