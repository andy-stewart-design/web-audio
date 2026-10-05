import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execute = promisify(execFile);
const entry = fileURLToPath(new URL("../cli.ts", import.meta.url));

describe("render command errors", () => {
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
