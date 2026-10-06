import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { readRecording } from "../runner/recording";

const execute = promisify(execFile);
const entry = fileURLToPath(new URL("../cli.ts", import.meta.url));

describe("render command recordings and errors", () => {
  it("saves a diagnostic WAV/sidecar and reports paths without claiming approval", async () => {
    const { stdout } = await execute(process.execPath, [
      "--import",
      "tsx",
      entry,
      "--case",
      "sine",
    ]);
    const path = fileURLToPath(
      new URL("../../artifacts/render/sine.wav", import.meta.url),
    );
    const stored = await readRecording(path);
    expect(stdout).toContain(`WAV: ${path}`);
    expect(stdout).toContain(
      "Diagnostic recording only; no reference comparison or approval.",
    );
    expect(stored.sampleRate).toBe(48_000);
    expect(stored.frameCount).toBe(112_800);
    expect(stored.channels).toHaveLength(2);
    expect(stored.metadata.id).toBe("sine");
    expect(stored.metadata.browserVersion).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
  });

  it.each([
    [["--case", "missing"], "Unknown case: missing"],
    [[], "Usage: audio:render --case <id>"],
  ])("exits nonzero for invalid selection %j", async (args, message) => {
    await expect(
      execute(process.execPath, ["--import", "tsx", entry, ...args]),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining(message),
    });
  });
});
