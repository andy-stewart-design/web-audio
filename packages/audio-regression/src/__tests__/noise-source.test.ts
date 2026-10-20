import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { withRenderer } from "../runner/render";

const adapterModule = fileURLToPath(
  new URL("../../../audio-engine/src/sources/noise-source.ts", import.meta.url),
);
const workletsModule = fileURLToPath(
  new URL("../../../worklets/dist/index.mjs", import.meta.url),
);

function fsModuleUrl(origin: string, file: string) {
  return `${origin}/@fs/${file.replaceAll("\\", "/")}`;
}

interface NativeWindow extends Window {
  __renderNoiseInitialSchedule?: () => Promise<{
    before: number;
    inside: number;
    after: number;
    ended: boolean;
  }>;
  __renderNoiseCancellation?: () => Promise<{
    ended: boolean;
    processorError: boolean;
    peak: number;
  }>;
  __renderNoiseFailure?: () => Promise<{
    processorError: boolean;
    ended: boolean;
    renderingError: boolean;
  }>;
}

describe("native noise source scheduling", () => {
  it("uses constructor frames before any MessagePort schedule arrives", async () => {
    await withRenderer(async (renderer) => {
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
            window.__renderNoiseInitialSchedule = async () => {
              const sampleRate = 48000;
              const startFrame = 37;
              const stopFrame = 211;
              const audio = new OfflineAudioContext({
                numberOfChannels: 1,
                length: 512,
                sampleRate,
              });
              const moduleUrl = URL.createObjectURL(
                new Blob([noiseProcessorSource], {
                  type: "application/javascript",
                }),
              );
              await audio.audioWorklet.addModule(moduleUrl);
              URL.revokeObjectURL(moduleUrl);

              const source = new NoiseSource(audio, {
                color: "pink",
                seed: 17,
                startFrame,
                stopFrame,
              });
              source.connect(audio.destination);
              let ended = false;
              source.onended = () => {
                ended = true;
              };

              try {
                const rendered = await audio.startRendering();
                const channel = rendered.getChannelData(0);
                const peak = (values) =>
                  values.reduce(
                    (result, value) => Math.max(result, Math.abs(value)),
                    0,
                  );
                return {
                  before: peak(channel.subarray(0, startFrame)),
                  inside: peak(channel.subarray(startFrame, stopFrame)),
                  after: peak(channel.subarray(stopFrame)),
                  ended,
                };
              } finally {
                source.disconnect();
              }
            };
          `,
        });
        await page.waitForFunction(
          () =>
            typeof (window as NativeWindow).__renderNoiseInitialSchedule ===
            "function",
        );
        const result = await page.evaluate(() => {
          const render = (window as NativeWindow).__renderNoiseInitialSchedule;
          if (!render) throw new Error("Native noise test is not ready");
          return render();
        });

        expect(result.before).toBe(0);
        expect(result.inside).toBeGreaterThan(0);
        expect(result.after).toBe(0);
        expect(result.ended).toBe(true);
      } finally {
        await context.close();
      }
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });

  it("acknowledges render-thread cancellation without processor activity", async () => {
    await withRenderer(async (renderer) => {
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
            window.__renderNoiseCancellation = async () => {
              const audio = new OfflineAudioContext({
                numberOfChannels: 1,
                length: 8192,
                sampleRate: 48000,
              });
              const moduleUrl = URL.createObjectURL(
                new Blob([noiseProcessorSource], {
                  type: "application/javascript",
                }),
              );
              await audio.audioWorklet.addModule(moduleUrl);
              URL.revokeObjectURL(moduleUrl);

              const source = new NoiseSource(audio, {
                color: "white",
                seed: 17,
                startFrame: 0,
                stopFrame: 100000,
              });
              let ended = false;
              source.onended = () => {
                ended = true;
              };
              let processorError = false;
              const onProcessorError = () => {
                processorError = true;
              };
              source.node.addEventListener("processorerror", onProcessorError);
              source.node.addEventListener("error", onProcessorError);
              source.connect(audio.destination);
              source.start(0);
              source.stop(0);
              source.disconnect();
              // Reconnect only to observe processor activity independently of
              // the adapter's disconnected output edge.
              source.node.connect(audio.destination);
              const rendered = await audio.startRendering();
              await new Promise((resolve) => setTimeout(resolve, 0));
              const channel = rendered.getChannelData(0);
              const peak = channel.reduce(
                (result, value) => Math.max(result, Math.abs(value)),
                0,
              );
              return {ended, processorError, peak};
            };
          `,
        });
        await page.waitForFunction(
          () =>
            typeof (window as NativeWindow).__renderNoiseCancellation ===
            "function",
        );
        const result = await page.evaluate(() => {
          const render = (window as NativeWindow).__renderNoiseCancellation;
          if (!render)
            throw new Error("Native noise cancellation test is not ready");
          return render();
        });

        expect(result.ended).toBe(true);
        expect(result.processorError).toBe(false);
        expect(result.peak).toBe(0);
      } finally {
        await context.close();
      }
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });

  it("completes adapter ownership when the processor reports an error", async () => {
    await withRenderer(async (renderer) => {
      const context = await renderer.browser.newContext({
        serviceWorkers: "block",
      });
      try {
        const page = await context.newPage();
        await page.goto(renderer.origin);
        const adapterUrl = fsModuleUrl(renderer.origin, adapterModule);
        await page.addScriptTag({
          type: "module",
          content: `
            import NoiseSource from ${JSON.stringify(adapterUrl)};
            window.__renderNoiseFailure = async () => {
              const audio = new OfflineAudioContext({
                numberOfChannels: 1,
                length: 512,
                sampleRate: 48000,
              });
              const failingModule = URL.createObjectURL(new Blob([
                \`registerProcessor("noise-processor", class extends AudioWorkletProcessor {
                  process(_inputs, outputs) {
                    outputs[0][0].fill(0.25);
                    throw new Error("deliberate noise processor failure");
                  }
                });\`
              ], {type: "application/javascript"}));
              await audio.audioWorklet.addModule(failingModule);
              URL.revokeObjectURL(failingModule);

              const NativeAudioWorkletNode = window.AudioWorkletNode;
              let processorError = false;
              window.AudioWorkletNode = class extends NativeAudioWorkletNode {
                constructor(...args) {
                  super(...args);
                  const onError = () => {
                    processorError = true;
                  };
                  this.addEventListener("processorerror", onError);
                  this.addEventListener("error", onError);
                }
              };
              const source = new NoiseSource(audio, {
                color: "white",
                seed: 17,
                startFrame: 0,
                stopFrame: 256,
              });
              let ended = false;
              source.onended = () => {
                ended = true;
              };
              source.connect(audio.destination);
              let renderingError = false;
              try {
                await audio.startRendering();
                await new Promise((resolve) => setTimeout(resolve, 0));
              } catch {
                renderingError = true;
              } finally {
                source.disconnect();
                window.AudioWorkletNode = NativeAudioWorkletNode;
              }
              return {processorError, ended, renderingError};
            };
          `,
        });
        await page.waitForFunction(
          () =>
            typeof (window as NativeWindow).__renderNoiseFailure === "function",
        );
        const result = await page.evaluate(() => {
          const render = (window as NativeWindow).__renderNoiseFailure;
          if (!render)
            throw new Error("Native noise failure test is not ready");
          return render();
        });

        expect(result.processorError).toBe(true);
        expect(result.ended).toBe(true);
        expect(result.renderingError).toBe(false);
      } finally {
        await context.close();
      }
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });
});
