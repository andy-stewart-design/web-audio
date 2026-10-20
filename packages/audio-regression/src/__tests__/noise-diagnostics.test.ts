import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { withRenderer } from "../runner/render";

const adapterModule = fileURLToPath(
  new URL(
    "../../../audio-engine/src/instruments/sources/noise-source.ts",
    import.meta.url,
  ),
);
const workletsModule = fileURLToPath(
  new URL("../../../worklets/dist/index.mjs", import.meta.url),
);

function fsModuleUrl(origin: string, file: string) {
  return `${origin}/@fs/${file.replaceAll("\\", "/")}`;
}

interface NativeWindow extends Window {
  __renderNoiseDiagnostic?: (color: "white" | "pink") => Promise<{
    peak: number;
    rms: number;
    afterStopPeak: number;
    wallMs: number;
    heapBytes: number | null;
  }>;
}

describe("native sustained noise diagnostics", () => {
  it("renders 60 seconds of 32 simultaneous layers at 48 kHz for both colors", async () => {
    await withRenderer(
      async (renderer) => {
        const context = await renderer.browser.newContext({
          serviceWorkers: "block",
        });
        try {
          const page = await context.newPage();
          await page.goto(renderer.origin);
          const adapterUrl = fsModuleUrl(renderer.origin, adapterModule);
          const workletsUrl = fsModuleUrl(renderer.origin, workletsModule);
          await page.addScriptTag({
            type: "module",
            content: `
                import NoiseSource from ${JSON.stringify(adapterUrl)};
                import { noiseProcessorSource } from ${JSON.stringify(workletsUrl)};
                window.__renderNoiseDiagnostic = async (color) => {
                  const sampleRate = 48000;
                  const stopFrame = sampleRate * 60;
                  const audio = new OfflineAudioContext({
                    numberOfChannels: 1,
                    length: stopFrame + 2048,
                    sampleRate,
                  });
                  const moduleUrl = URL.createObjectURL(new Blob([
                    noiseProcessorSource
                  ], {type: 'application/javascript'}));
                  await audio.audioWorklet.addModule(moduleUrl);
                  URL.revokeObjectURL(moduleUrl);

                  const sources = [];
                  const gains = [];
                  for (let index = 0; index < 32; index++) {
                    const source = new NoiseSource(audio, {
                      color,
                      seed: 0,
                      startFrame: 0,
                      stopFrame,
                    });
                    const gain = audio.createGain();
                    gain.gain.value = 1 / 32;
                    source.connect(gain);
                    gain.connect(audio.destination);
                    source.start(0);
                    source.stop(60);
                    sources.push(source);
                    gains.push(gain);
                  }

                  const started = performance.now();
                  try {
                    const rendered = await audio.startRendering();
                    const channel = rendered.getChannelData(0);
                    let sum = 0;
                    let peak = 0;
                    for (let index = 0; index < stopFrame; index++) {
                      const value = channel[index];
                      sum += value * value;
                      peak = Math.max(peak, Math.abs(value));
                    }
                    let afterStopPeak = 0;
                    for (let index = stopFrame; index < channel.length; index++)
                      afterStopPeak = Math.max(afterStopPeak, Math.abs(channel[index]));
                    return {
                      peak,
                      rms: Math.sqrt(sum / stopFrame),
                      afterStopPeak,
                      wallMs: performance.now() - started,
                      heapBytes: performance.memory?.usedJSHeapSize ?? null,
                    };
                  } finally {
                    for (let index = 0; index < sources.length; index++) {
                      sources[index].disconnect();
                      gains[index].disconnect();
                    }
                  }
                };
              `,
          });
          await page.waitForFunction(
            () =>
              typeof (window as NativeWindow).__renderNoiseDiagnostic ===
              "function",
          );
          for (const color of ["white", "pink"] as const) {
            const result = await page.evaluate((value) => {
              const render = (window as NativeWindow).__renderNoiseDiagnostic;
              if (!render) throw new Error("Noise diagnostic is not ready");
              return render(value);
            }, color);

            expect(result.peak).toBeGreaterThan(0);
            expect(result.rms).toBeGreaterThan(0);
            expect(Number.isFinite(result.peak)).toBe(true);
            expect(Number.isFinite(result.rms)).toBe(true);
            expect(result.afterStopPeak).toBe(0);
            expect(result.wallMs).toBeGreaterThan(0);
            if (result.heapBytes !== null)
              expect(Number.isFinite(result.heapBytes)).toBe(true);
          }
        } finally {
          await context.close();
        }
        expect(renderer.browser.contexts()).toHaveLength(0);
      },
      { timeoutMs: 120_000 },
    );
  }, 120_000);
});
