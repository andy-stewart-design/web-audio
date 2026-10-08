import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { withRenderer } from "../runner/render";
import { sampleWav, sketch } from "./support/cases";
import { withDiagnosticReady } from "./support/diagnostics";

describe("native sample diagnostics", () => {
  it("rejects sample failures alongside a healthy synth, closes each context, and recovers", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "audio-sample-diagnostics-"),
    );
    const file = join(directory, "sample.wav");
    const sampleCode = (
      source: string,
    ) => `d.loadSamples({bank: 'local', samples: {hit: [${JSON.stringify(source)}]}});
d.sample('hit').bank('local').clip(false).push();
${sketch().code}`;
    try {
      await withRenderer(async (renderer) => {
        for (const failure of ["missing", "corrupt", "unmapped", "external"]) {
          if (failure === "missing") await rm(file, { force: true });
          else
            await writeFile(
              file,
              failure === "corrupt" ? "not audio" : sampleWav,
            );
          const source =
            failure === "external"
              ? "https://audio-regression.invalid/sample.wav"
              : "/samples/input.wav";
          const input = sketch({
            code: sampleCode(source),
            resources:
              failure === "unmapped" || failure === "external"
                ? {}
                : { [source]: file },
          });
          await expect(
            renderer.render(input).then(() => undefined),
            failure,
          ).rejects.toThrow(
            failure === "external"
              ? /Blocked external request/
              : /HTTP 404|Failed to load/,
          );
          expect(renderer.browser.contexts(), failure).toHaveLength(0);
        }
        await writeFile(file, sampleWav);
        // Also prove that an external manifest URL works when explicitly mapped.
        const source = "https://audio-regression.invalid/sample.wav";
        const recovered = await renderer.render(
          sketch({ code: sampleCode(source), resources: { [source]: file } }),
        );
        expect(recovered.metrics.some(({ rms }) => rms > 0)).toBe(true);
        expect(renderer.browser.contexts()).toHaveLength(0);
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("blocks external requests from authored workers", async () => {
    const worker =
      "fetch('https://audio-regression.invalid/worker.wav').catch(() => {}).then(() => postMessage('request settled'));";
    const code = withDiagnosticReady(
      sketch().code,
      `const worker = new Worker(URL.createObjectURL(new Blob([${JSON.stringify(worker)}], {type: 'text/javascript'})));
       worker.onmessage = () => resolve();`,
    );
    await withRenderer(async (renderer) => {
      await expect(
        renderer.render(sketch({ code })).then(() => undefined),
      ).rejects.toThrow(/Blocked external request/);
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });
});
