import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { readRecording, writeRecording } from "../runner/recording";
import { withRenderer } from "../runner/render";
import { sketch } from "./support/cases";

const execute = promisify(execFile);
const entry = fileURLToPath(new URL("../verify-cli.ts", import.meta.url));
const driver = fileURLToPath(
  new URL("./support/verify-command.ts", import.meta.url),
);

async function withFixture<T>(
  run: (referenceDirectory: string, artifactDirectory: string) => Promise<T>,
) {
  const directory = await mkdtemp(join(tmpdir(), "audio-verify-command-"));
  try {
    const referenceDirectory = join(directory, "references");
    const artifactDirectory = join(directory, "artifacts");
    await withRenderer(async (renderer) => {
      await writeRecording(
        join(referenceDirectory, "sine", "render.wav"),
        await renderer.render(sketch()),
      );
    });
    return await run(referenceDirectory, artifactDirectory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const runDriver = (
  referenceDirectory: string,
  artifactDirectory: string,
  mode: string,
  ...args: string[]
) =>
  execute(process.execPath, [
    "--import",
    "tsx",
    driver,
    referenceDirectory,
    artifactDirectory,
    mode,
    ...args,
  ]);

async function bytes(referenceDirectory: string) {
  return Promise.all([
    readFile(join(referenceDirectory, "sine", "render.wav")),
    readFile(join(referenceDirectory, "sine", "metadata.json")),
  ]);
}

async function expectUnchanged(referenceDirectory: string, before: Buffer[]) {
  expect(
    (await bytes(referenceDirectory)).every((value, index) =>
      value.equals(before[index]!),
    ),
  ).toBe(true);
}

describe("verification command exit policy", () => {
  it.each([
    [["--case", "unknown"], "Unknown case: unknown"],
    [["--case"], "Usage: audio:verify [--case <id>]"],
    [["--update"], "Usage: audio:verify [--case <id>]"],
    [["--case", "sine", "extra"], "Usage: audio:verify [--case <id>]"],
  ])(
    "actual CLI rejects invalid selection %j with exit 1",
    async (args, message) => {
      await expect(
        execute(process.execPath, ["--import", "tsx", entry, ...args]),
      ).rejects.toMatchObject({
        code: 1,
        stderr: expect.stringContaining(message),
      });
    },
  );

  it("passes freshly rendered unapproved fixtures in a separate Node/browser process without modifying references", async () => {
    await withFixture(async (referenceDirectory, artifactDirectory) => {
      const before = await bytes(referenceDirectory);
      const all = await runDriver(
        referenceDirectory,
        artifactDirectory,
        "original",
      );
      expect(all.stdout).toContain(
        "Audio verification passed: 1/1 cases passed. References were not updated.",
      );
      expect(all.stdout).toContain("max=0.000000e+0");
      const selected = await runDriver(
        referenceDirectory,
        artifactDirectory,
        "original",
        "--case",
        "sine",
      );
      expect(selected.stdout).toContain("[sine] PASS");
      await expectUnchanged(referenceDirectory, before);
    });
  });

  it.each([
    ["gain", "Worst error:", "difference"],
    ["evaluation", "deliberate command evaluation failure", "reference"],
    ["sample", "Failed to load", "reference"],
  ])(
    "propagates %s failure as exit 1 with useful diagnostics/artifacts and unchanged references",
    async (mode, message, artifact) => {
      await withFixture(async (referenceDirectory, artifactDirectory) => {
        const before = await bytes(referenceDirectory);
        await expect(
          runDriver(referenceDirectory, artifactDirectory, mode),
        ).rejects.toMatchObject({
          code: 1,
          stdout: expect.stringContaining(message),
        });
        const stored = await readRecording(
          join(artifactDirectory, "sine", `${artifact}.wav`),
        );
        expect(stored.frameCount).toBe(112_800);
        await expectUnchanged(referenceDirectory, before);
      });
    },
  );

  it("fails missing coverage with real current-only audio, not an automatically created reference", async () => {
    await withFixture(async (referenceDirectory, artifactDirectory) => {
      await rm(join(referenceDirectory, "sine", "render.wav"));
      const sidecar = await readFile(
        join(referenceDirectory, "sine", "metadata.json"),
      );
      await expect(
        runDriver(referenceDirectory, artifactDirectory, "original"),
      ).rejects.toMatchObject({
        code: 1,
        stdout: expect.stringContaining(
          "Reference unavailable (missing or invalid)",
        ),
      });
      expect(
        (await readRecording(join(artifactDirectory, "sine", "current.wav")))
          .frameCount,
      ).toBe(112_800);
      await expect(
        readFile(join(referenceDirectory, "sine", "render.wav")),
      ).rejects.toMatchObject({ code: "ENOENT" });
      expect(
        (
          await readFile(join(referenceDirectory, "sine", "metadata.json"))
        ).equals(sidecar),
      ).toBe(true);
    });
  });

  it("fails an empty suite with exit 1 before launching or clearing previous artifacts", async () => {
    await withFixture(async (referenceDirectory, artifactDirectory) => {
      const before = await bytes(referenceDirectory);
      await expect(
        runDriver(referenceDirectory, artifactDirectory, "empty"),
      ).rejects.toMatchObject({
        code: 1,
        stderr: expect.stringContaining("Case registry is empty"),
      });
      await expectUnchanged(referenceDirectory, before);
    });
  });
});
