import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { withHarness } from "../with-harness";

async function withDirectory<T>(run: (directory: string) => Promise<T>) {
  const directory = await mkdtemp(join(tmpdir(), "audio-resources-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("case-local HTTP resources", () => {
  it("serves original bytes at isolated URLs and removes only disposed mounts", async () => {
    await withDirectory(async (directory) => {
      const bytes = Buffer.from([0, 255, 12, 34]);
      const firstFile = join(directory, "input.bin");
      const secondFile = join(directory, "other.bin");
      await writeFile(firstFile, bytes);
      await writeFile(secondFile, "different bytes");
      await withHarness(async (origin, mount) => {
        const first = mount({ "/input": firstFile });
        const second = mount({ "/input": secondFile });
        try {
          const url = first.urls["/input"];
          expect(url).not.toBe(second.urls["/input"]);
          const response = await fetch(origin + url);
          expect(response.ok).toBe(true);
          expect(response.headers.get("cache-control")).toBe("no-store");
          expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
          expect(
            await (await fetch(origin + second.urls["/input"])).text(),
          ).toBe("different bytes");
          first.dispose();
          expect((await fetch(origin + url)).status).toBe(404);
          expect((await fetch(origin + second.urls["/input"])).ok).toBe(true);
        } finally {
          first.dispose();
          second.dispose();
        }
      });
    });
  });

  it("reports missing files and directories without HTML fallback", async () => {
    await withDirectory(async (directory) => {
      await withHarness(async (origin, mount) => {
        const resources = mount({
          missing: join(directory, "absent"),
          directory,
        });
        try {
          expect((await fetch(origin + resources.urls.missing)).status).toBe(
            404,
          );
          expect((await fetch(origin + resources.urls.directory)).ok).toBe(
            false,
          );
          expect(resources.errors).toHaveLength(2);
        } finally {
          resources.dispose();
        }
      });
    });
  });
});
