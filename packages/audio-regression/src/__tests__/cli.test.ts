import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execute = promisify(execFile);

describe("actual command entry points", () => {
  it.each([
    ["cli.ts", []],
    ["verify-cli.ts", ["--update"]],
    ["update-cli.ts", []],
  ])("%s exits nonzero for invalid arguments", async (file, args) => {
    const entry = fileURLToPath(new URL(`../${file}`, import.meta.url));
    await expect(
      execute(process.execPath, ["--import", "tsx", entry, ...args]),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringMatching(/Usage:/),
    });
  });
});
