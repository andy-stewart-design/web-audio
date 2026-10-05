import type { Browser } from "playwright";
import { describe, expect, it } from "vitest";
import { withRenderer } from "../runner/render";
import { estimateFrequency, sketch, windowPeak } from "./support/cases";

describe("real engine offline rendering", () => {
  it("renders real stereo sine audio with default BPM, exact start/length and release tail", async () => {
    let browser: Browser | undefined;
    let origin = "";
    await withRenderer(async (renderer) => {
      browser = renderer.browser;
      origin = renderer.origin;
      const result = await renderer.render(sketch());
      expect(result.bpm).toBe(120);
      expect(result.settings).toEqual({
        sampleRate: 48_000,
        channels: 2,
        beatsPerBar: 4,
        startOffsetFrames: 4_800,
      });
      expect(result.frameCount).toBe(112_800);
      expect(result.channels).toHaveLength(2);
      const [left, right] = result.channels;
      if (!left || !right) throw new Error("Missing stereo channels");
      expect(left).toBeInstanceOf(Float32Array);
      expect(left.length).toBe(result.frameCount);
      expect(left.every((sample, frame) => sample === right[frame])).toBe(true);
      expect(left.slice(0, 4_800).every((value) => value === 0)).toBe(true);
      expect(result.metrics[0]?.peak).toBeCloseTo(0.1625, 4);
      expect(result.metrics[0]?.rms).toBeGreaterThan(0.1);
      expect(estimateFrequency(left, 9_600, 33_600, 48_000)).toBeCloseTo(
        440,
        0,
      );
      expect(windowPeak(left, 2.105, 0.025, 48_000)).toBeGreaterThan(0.03);
      expect(windowPeak(left, 2.21, 0.1, 48_000)).toBe(0);
      expect(result.browserVersion).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
    expect(browser?.isConnected()).toBe(false);
    await expect(fetch(origin)).rejects.toThrow();
  });

  it("uses committed schema BPM for exact multi-bar onset timing", async () => {
    await withRenderer(async (renderer) => {
      const result = await renderer.render(
        sketch({
          id: "tempo",
          code: "d.bpm(90); d.synth('sine').notes(69).sequence(4, 0).gain(0.5).adsr(0.005, 0, 1, 0.02).push();",
          bars: 2,
          tailSeconds: 0.15,
        }),
      );
      expect(result.bpm).toBe(90);
      expect(result.barDuration).toBe(8 / 3);
      expect(result.frameCount).toBe(
        Math.ceil((0.1 + 2 * (8 / 3) + 0.15) * 48_000),
      );
      const channel = result.channels[0];
      if (!channel) throw new Error("Missing audio");
      const secondBar = 0.1 + 8 / 3;
      expect(windowPeak(channel, secondBar - 0.06, 0.04, 48_000)).toBe(0);
      expect(
        windowPeak(channel, secondBar + 0.01, 0.05, 48_000),
      ).toBeGreaterThan(0.1);
      // The app's constructor tempo (140) must not leak into offline scheduling.
      expect(windowPeak(channel, 0.1 + 240 / 140 + 0.01, 0.05, 48_000)).toBe(0);
    });
  });

  it("supports mono/alternate sample rates and explicit silent cases", async () => {
    await withRenderer(async (renderer) => {
      const mono = await renderer.render(
        sketch({
          settings: {
            sampleRate: 44_100,
            channels: 1,
            startOffsetFrames: 4_410,
          },
        }),
      );
      expect(mono.channels).toHaveLength(1);
      expect(mono.frameCount).toBe(103_635);
      const silent = await renderer.render(
        sketch({ id: "silent", code: "", expectSilence: true }),
      );
      expect(silent.metrics.every(({ peak }) => peak === 0)).toBe(true);
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });

  it.each([
    ["const = ;", /Unexpected token/],
    ["throw new Error('invalid sketch');", /invalid sketch/],
    ["d.synth().route('missing').push();", /declared bus/],
    ["", /Expected audible/],
    [
      "console.warn('deliberate warning'); d.synth().push();",
      /deliberate warning/,
    ],
    [
      "fetch('https://audio-regression.invalid/blocked').catch(() => {}); d.synth().push();",
      /Blocked external request/,
    ],
    [
      "setTimeout(() => { throw new Error('deliberate page error'); }, 0); d.synth().push();",
      /deliberate page error/,
    ],
    ["fetch('/missing.wav').catch(() => {}); d.synth().push();", /HTTP 404/],
    ["d.sample('bd').push();", /Step 1.5/],
    ["d.synth().out(d.midi.out()).push();", /MIDI output/],
  ])(
    "fails bad source/diagnostics without poisoning the next render: %s",
    async (code, message) => {
      await withRenderer(async (renderer) => {
        await expect(
          renderer
            .render(sketch({ id: "failure", code }))
            .then(() => undefined),
        ).rejects.toThrow(message);
        expect(renderer.browser.contexts()).toHaveLength(0);
        const recovered = await renderer.render(sketch());
        expect(recovered.metrics[0]?.rms).toBeGreaterThan(0.1);
      });
    },
  );

  it("bounds a synchronous source hang from Node and disposes its context", async () => {
    await withRenderer(
      async (renderer) => {
        await renderer.render(sketch()); // Warm the harness before the hang test.
        await expect(
          renderer.render(sketch({ id: "hang", code: "while (true) {}" })),
        ).rejects.toThrow(/\[hang\].*timed out/);
        expect(renderer.browser.contexts()).toHaveLength(0);
        expect(
          (await renderer.render(sketch())).metrics[0]?.rms,
        ).toBeGreaterThan(0.1);
      },
      { timeoutMs: 1_500 },
    );
  });

  it("closes the browser and server when the owner callback fails", async () => {
    let browser: Browser | undefined;
    let origin = "";
    await expect(
      withRenderer(async (renderer) => {
        browser = renderer.browser;
        origin = renderer.origin;
        await renderer.render(sketch());
        throw new Error("owner failed");
      }),
    ).rejects.toThrow("owner failed");
    expect(browser?.isConnected()).toBe(false);
    await expect(fetch(origin)).rejects.toThrow();
  });
});
