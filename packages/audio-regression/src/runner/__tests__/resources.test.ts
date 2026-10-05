import { describe, expect, it } from "vitest";
import { withHarness } from "../with-harness";

describe("case-local HTTP resources", () => {
  it("serves original bytes with isolated URLs and removes mounts", async () => {
    await withHarness(async (origin, mount) => {
      const first = mount({ "/tone.wav": "resources/tone.wav" });
      const second = mount({
        "/tone.wav": "src/__tests__/support/not-audio.txt",
      });
      try {
        const url = first.urls["/tone.wav"];
        expect(url).not.toBe(second.urls["/tone.wav"]);
        const response = await fetch(origin + url);
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("audio/wav");
        expect(response.headers.get("cache-control")).toBe("no-store");
        const bytes = Buffer.from(await response.arrayBuffer());
        expect(bytes.length).toBe(48_044);
        expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
        expect(
          await (await fetch(origin + second.urls["/tone.wav"])).text(),
        ).toContain("invalid audio");
        first.dispose();
        expect((await fetch(origin + url)).status).toBe(404);
        expect((await fetch(origin + second.urls["/tone.wav"])).status).toBe(
          200,
        );
        expect(first.errors).toEqual([]);
      } finally {
        first.dispose();
        second.dispose();
      }
    });
  });

  it("reports missing files and refuses directories without HTML fallback", async () => {
    await withHarness(async (origin, mount) => {
      const resources = mount({
        missing: "resources/no-such-file.wav",
        directory: "resources",
      });
      try {
        expect((await fetch(origin + resources.urls.missing)).status).toBe(404);
        expect((await fetch(origin + resources.urls.directory)).status).toBe(
          500,
        );
        expect(resources.errors.join("\n")).toMatch(/no-such-file.wav/);
        expect(resources.errors.join("\n")).toMatch(/not a regular file/);
      } finally {
        resources.dispose();
      }
    });
  });
});
