import type { Browser } from "playwright";
import { describe, expect, it } from "vitest";
import { normalizeCase, planRender } from "../cases";
import { withRenderer } from "../runner/render";
import { sketch } from "./support/cases";

describe("native rendering", () => {
  it("returns the requested stereo/mono shape and closes its browser and server", async () => {
    let browser: Browser | undefined;
    let origin = "";
    await withRenderer(async (renderer) => {
      browser = renderer.browser;
      origin = renderer.origin;
      for (const { input, bpm } of [
        { input: sketch(), bpm: 120 },
        {
          input: sketch({
            code: "d.bpm(90); d.synth('sine').notes(69).push();",
            bars: 2,
            settings: {
              channels: 1,
              sampleRate: 44_100,
              startOffsetFrames: 4_417,
            },
          }),
          bpm: 90,
        },
      ]) {
        const result = await renderer.render(input);
        const planned = planRender(normalizeCase(input), bpm);
        expect(result.bpm).toBe(bpm);
        expect(result.frameCount).toBe(planned.frameCount);
        expect(result.channels).toHaveLength(result.settings.channels);
        expect(
          result.channels.every(
            (channel) =>
              channel instanceof Float32Array &&
              channel.length === planned.frameCount &&
              channel.every(Number.isFinite) &&
              channel
                .subarray(0, result.settings.startOffsetFrames)
                .every((value) => value === 0),
          ),
        ).toBe(true);
        expect(result.metrics.some(({ rms }) => rms > 0)).toBe(true);
        expect(renderer.browser.contexts()).toHaveLength(0);
      }
      const silent = await renderer.render(
        sketch({ code: "", expectSilence: true }),
      );
      expect(
        silent.channels.every((channel) =>
          channel.every((value) => value === 0),
        ),
      ).toBe(true);
    });
    expect(browser?.isConnected()).toBe(false);
    await expect(fetch(origin)).rejects.toThrow();
  });

  it.each([
    ["throw new Error('invalid sketch');", /invalid sketch/],
    [
      "console.warn('deliberate warning'); d.synth().push();",
      /deliberate warning/,
    ],
    [
      "setTimeout(() => { throw new Error('deliberate page error'); }, 0); d.synth().push();",
      /deliberate page error/,
    ],
    ["d.synth().out(d.midi.out()).push();", /MIDI output/],
  ])("rejects source/diagnostic failures: %s", async (code, message) => {
    await withRenderer(async (renderer) => {
      await expect(
        renderer.render(sketch({ code })).then(() => undefined),
      ).rejects.toThrow(message);
      expect(renderer.browser.contexts()).toHaveLength(0);
      expect(
        (await renderer.render(sketch())).metrics.some(({ rms }) => rms > 0),
      ).toBe(true);
    });
  });

  it("bounds synchronous hangs and recovers without retaining a context", async () => {
    await withRenderer(
      async (renderer) => {
        await renderer.render(sketch());
        await expect(
          renderer.render(sketch({ code: "while (true) {}" })),
        ).rejects.toThrow(/timed out/);
        expect(renderer.browser.contexts()).toHaveLength(0);
        expect(
          (await renderer.render(sketch())).metrics.some(({ rms }) => rms > 0),
        ).toBe(true);
      },
      { timeoutMs: 3_000 },
    );
  });

  it("closes the browser and server when its owner fails", async () => {
    let browser: Browser | undefined;
    let origin = "";
    await expect(
      withRenderer(async (renderer) => {
        browser = renderer.browser;
        origin = renderer.origin;
        throw new Error("owner failed");
      }),
    ).rejects.toThrow("owner failed");
    expect(browser?.isConnected()).toBe(false);
    await expect(fetch(origin)).rejects.toThrow();
  });
});
