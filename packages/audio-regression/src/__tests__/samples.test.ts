import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { withRenderer } from "../runner/render";
import { sampleWav, sketch } from "./support/cases";

describe("native sample diagnostics", () => {
  it.each(["missing", "corrupt", "unmapped", "external"])(
    "rejects %s samples even alongside a healthy synth and recovers",
    async (failure) => {
      const directory = await mkdtemp(
        join(tmpdir(), "audio-sample-diagnostics-"),
      );
      const file = join(directory, "sample.wav");
      const source =
        failure === "external"
          ? "https://audio-regression.invalid/sample.wav"
          : "/samples/input.wav";
      const code = `d.loadSamples({bank: 'local', samples: {hit: [${JSON.stringify(source)}]}});
d.sample('hit').bank('local').clip(false).push();
${sketch().code}`;
      try {
        if (failure === "corrupt") await writeFile(file, "not audio");
        await withRenderer(async (renderer) => {
          const input = sketch({
            code,
            resources:
              failure === "unmapped" || failure === "external"
                ? {}
                : { [source]: file },
          });
          await expect(
            renderer.render(input).then(() => undefined),
          ).rejects.toThrow(
            failure === "external"
              ? /Blocked external request/
              : /HTTP 404|Failed to load/,
          );
          expect(renderer.browser.contexts()).toHaveLength(0);
          await writeFile(file, sampleWav);
          const recovered = await renderer.render(
            sketch({ code, resources: { [source]: file } }),
          );
          expect(recovered.metrics.some(({ rms }) => rms > 0)).toBe(true);
        });
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

  it("blocks external requests from authored workers", async () => {
    const worker =
      "fetch('https://audio-regression.invalid/worker.wav').catch(() => {});";
    const code = `new Worker(URL.createObjectURL(new Blob([${JSON.stringify(worker)}], {type: 'text/javascript'})));
${sketch().code}`;
    await withRenderer(async (renderer) => {
      await expect(
        renderer.render(sketch({ code })).then(() => undefined),
      ).rejects.toThrow(/Blocked external request/);
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });
});
