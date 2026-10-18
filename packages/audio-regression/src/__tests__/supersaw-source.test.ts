import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { withRenderer } from "../runner/render";

const adapterModule = fileURLToPath(
  new URL(
    "../../../audio-engine/src/instruments/sources/supersaw-source.ts",
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
  __renderSupersawInitialSchedule?: () => Promise<{
    before: number[];
    inside: number[];
    after: number[];
  }>;
}

describe("native supersaw source scheduling", () => {
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
            import SupersawSource from ${JSON.stringify(adapterUrl)};
            import { supersawProcessorSource } from ${JSON.stringify(workletsUrl)};
            window.__renderSupersawInitialSchedule = async () => {
              const sampleRate = 48000;
              const startFrame = 37;
              const stopFrame = 211;
              const audio = new OfflineAudioContext({
                numberOfChannels: 2,
                length: 512,
                sampleRate,
              });
              const moduleUrl = URL.createObjectURL(
                new Blob([supersawProcessorSource], {
                  type: "application/javascript",
                }),
              );
              await audio.audioWorklet.addModule(moduleUrl);
              URL.revokeObjectURL(moduleUrl);

              const source = new SupersawSource(audio, {
                voices: 2,
                phaseSeed: 17,
                startFrame,
                stopFrame,
              });
              source.frequency.value = 220;
              source.spread.value = 12;
              source.width.value = 0.4;
              source.connect(audio.destination);

              try {
                const rendered = await audio.startRendering();
                const channels = Array.from(
                  { length: rendered.numberOfChannels },
                  (_, channel) => rendered.getChannelData(channel),
                );
                const peak = (values) =>
                  values.reduce(
                    (result, value) => Math.max(result, Math.abs(value)),
                    0,
                  );
                return {
                  before: channels.map((channel) =>
                    peak(channel.subarray(0, startFrame)),
                  ),
                  inside: channels.map((channel) =>
                    peak(channel.subarray(startFrame, stopFrame)),
                  ),
                  after: channels.map((channel) =>
                    peak(channel.subarray(stopFrame)),
                  ),
                };
              } finally {
                source.disconnect();
              }
            };
          `,
        });
        await page.waitForFunction(
          () =>
            typeof (window as NativeWindow).__renderSupersawInitialSchedule ===
            "function",
        );
        const result = await page.evaluate(() => {
          const render = (window as NativeWindow)
            .__renderSupersawInitialSchedule;
          if (!render) throw new Error("Native supersaw test is not ready");
          return render();
        });

        expect(result.before).toEqual([0, 0]);
        expect(result.inside.every((value) => value > 0)).toBe(true);
        expect(result.after).toEqual([0, 0]);
      } finally {
        await context.close();
      }
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });
});
