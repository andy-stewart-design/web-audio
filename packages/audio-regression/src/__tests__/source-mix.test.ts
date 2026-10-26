import { describe, expect, it } from "vitest";
import { compareAudio } from "../runner/compare";
import { withRenderer } from "../runner/render";
import type { SketchCase } from "../types";

type NativeRender = Awaited<
  ReturnType<Parameters<Parameters<typeof withRenderer>[0]>[0]["render"]>
>;

function renderCase(code: string, expectSilence = false): SketchCase {
  return {
    id: "source-mix-native",
    description: "Temporary native main-source gain fixture",
    code,
    bars: 1,
    tailSeconds: 0.25,
    expectSilence,
    settings: { sampleRate: 48_000, channels: 2, startOffsetFrames: 4_800 },
  };
}

function audio(result: NativeRender) {
  return { sampleRate: result.settings.sampleRate, channels: result.channels };
}

function maxAbs(channels: readonly Float32Array[]) {
  let peak = 0;
  for (const channel of channels) {
    for (const value of channel) peak = Math.max(peak, Math.abs(value));
  }
  return peak;
}

function maxChannelDifference(channels: readonly Float32Array[]) {
  if (channels.length < 2) return 0;
  return channels[0]!.reduce(
    (max, value, frame) =>
      Math.max(max, Math.abs(value - channels[1]![frame]!)),
    0,
  );
}

const basic = (factory: string) => `d.bpm(120);
d.${factory}
  .notes(60)
  .xox("1")
  .gain(0.4)
  .adsr(0, 0, 1, 0.1)
  .push();`;

describe("native main source gain", () => {
  it("preserves omitted/unity parity and gain-only selector parity", async () => {
    await withRenderer(async (renderer) => {
      const omitted = await renderer.render(renderCase(basic('synth("sine")')));
      const unity = await renderer.render(
        renderCase(basic('synth("sine", 1)')),
      );
      const gainOnly = await renderer.render(renderCase(basic("synth(0.5)")));
      const explicit = await renderer.render(
        renderCase(basic('synth("sine", 0.5)')),
      );

      for (const result of [omitted, unity, gainOnly, explicit]) {
        expect(
          result.channels.every((channel) => channel.every(Number.isFinite)),
        ).toBe(true);
        expect(maxAbs(result.channels)).toBeGreaterThan(1e-5);
      }
      expect(
        compareAudio(audio(omitted), audio(unity), {
          tolerance: { maxError: 1e-6, rmsError: 1e-7 },
        }).passed,
      ).toBe(true);
      expect(
        compareAudio(audio(gainOnly), audio(explicit), {
          tolerance: { maxError: 1e-6, rmsError: 1e-7 },
        }).passed,
      ).toBe(true);
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });

  it("silences a static zero source gain without affecting the renderer lifetime", async () => {
    await withRenderer(async (renderer) => {
      const result = await renderer.render(renderCase(basic("synth(0)"), true));
      expect(
        result.channels.every((channel) =>
          channel.every((value) => value === 0),
        ),
      ).toBe(true);
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });

  it("scales unison stereo difference with the complete source", async () => {
    await withRenderer(async (renderer) => {
      const render = (sourceGain: string) =>
        renderer.render(
          renderCase(`d.bpm(120);
d.synth("unison", ${sourceGain})
  .notes(60)
  .xox("1")
  .voices(3)
  .spread(24)
  .width(1)
  .gain(0.4)
  .adsr(0, 0, 1, 0.1)
  .push();`),
        );
      const unity = await render("1");
      const scaled = await render("0.5");

      for (const result of [unity, scaled]) {
        expect(result.channels).toHaveLength(2);
        expect(
          result.channels.every((channel) => channel.every(Number.isFinite)),
        ).toBe(true);
        expect(maxAbs(result.channels)).toBeGreaterThan(1e-5);
      }
      const unityDifference = maxChannelDifference(unity.channels);
      const scaledDifference = maxChannelDifference(scaled.channels);
      expect(unityDifference).toBeGreaterThan(1e-5);
      expect(scaledDifference).toBeCloseTo(unityDifference * 0.5, 5);
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });

  it("leaves noise unchanged when the main source gain is zero", async () => {
    await withRenderer(async (renderer) => {
      const render = (factory: string) =>
        renderer.render(
          renderCase(`d.bpm(120);
d.${factory}
  .notes(60)
  .xox("1")
  .noise("white", 0.3)
  .gain(0.4)
  .adsr(0, 0, 1, 0.1)
  .push();`),
        );
      const noiseOnly = await render("synth(0)");
      const zeroedSaw = await render('synth("saw", 0)');

      expect(
        compareAudio(audio(noiseOnly), audio(zeroedSaw), {
          tolerance: { maxError: 1e-6, rmsError: 1e-7 },
        }).passed,
      ).toBe(true);
      expect(maxAbs(noiseOnly.channels)).toBeGreaterThan(1e-5);
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });
});
