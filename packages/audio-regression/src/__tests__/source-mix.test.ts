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

function maxAudioDifference(
  left: readonly Float32Array[],
  right: readonly Float32Array[],
) {
  return left.reduce(
    (max, channel, channelIndex) =>
      channel.reduce(
        (channelMax, value, frame) =>
          Math.max(channelMax, Math.abs(value - right[channelIndex]![frame]!)),
        max,
      ),
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

describe("native main source gain and pitched sub", () => {
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

  it("scales a basic waveform through its source gain stage", async () => {
    await withRenderer(async (renderer) => {
      const unity = await renderer.render(
        renderCase(basic('synth("sine", 1)')),
      );
      const half = await renderer.render(
        renderCase(basic('synth("sine", 0.5)')),
      );

      expect(maxAbs(unity.channels)).toBeGreaterThan(1e-5);
      expect(maxAbs(half.channels)).toBeCloseTo(
        maxAbs(unity.channels) * 0.5,
        5,
      );
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

  it("keeps nonzero unison main and centered sub contributions separate", async () => {
    await withRenderer(async (renderer) => {
      const render = (factory: string) =>
        renderer.render(
          renderCase(`d.bpm(120);
 d.${factory}
   .notes(60)
   .xox("1")
   .voices(3)
   .spread(24)
   .width(1)
   .gain(0.35)
   .adsr(0, 0, 1, 0.1)
   .push();`),
        );
      const mainOnly = await render('synth("unison", 0.35)');
      const subOnly = await render('synth("unison", 0).sub("sine", -1, 0.5)');
      const composed = await render(
        'synth("unison", 0.35).sub("sine", -1, 0.5)',
      );

      for (const result of [mainOnly, subOnly, composed]) {
        expect(result.channels).toHaveLength(2);
        expect(
          result.channels.every((channel) => channel.every(Number.isFinite)),
        ).toBe(true);
        expect(maxAbs(result.channels)).toBeGreaterThan(1e-5);
      }
      expect(
        maxAudioDifference(composed.channels, mainOnly.channels),
      ).toBeGreaterThan(1e-5);
      expect(
        maxAudioDifference(composed.channels, subOnly.channels),
      ).toBeGreaterThan(1e-5);
      expect(maxChannelDifference(composed.channels)).toBeGreaterThan(1e-5);
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });

  it("renders every sub waveform at both supported octaves", async () => {
    await withRenderer(async (renderer) => {
      for (const waveform of [
        "sine",
        "triangle",
        "square",
        "sawtooth",
      ] as const) {
        for (const octave of [-1, -2] as const) {
          const result = await renderer.render(
            renderCase(`d.bpm(120);
 d.synth(0).sub("${waveform}", ${octave}, 0.5)
   .notes(60)
   .xox("1")
   .gain(0.4)
   .adsr(0, 0, 1, 0.1)
   .push();`),
          );
          expect(maxAbs(result.channels)).toBeGreaterThan(1e-5);
          expect(
            result.channels.every((channel) => channel.every(Number.isFinite)),
          ).toBe(true);
        }
      }
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });

  it("keeps the centered sub audible with a muted main source", async () => {
    await withRenderer(async (renderer) => {
      const result = await renderer.render(
        renderCase(`d.bpm(120);
 d.synth(0).sub("sine", -1, 0.5)
   .notes(60)
   .xox("1")
   .gain(0.4)
   .adsr(0, 0, 1, 0.1)
   .push();`),
      );
      expect(maxAbs(result.channels)).toBeGreaterThan(1e-5);
      expect(maxChannelDifference(result.channels)).toBeLessThan(1e-5);
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });

  it("preserves main and noise output when the sub contribution is zero", async () => {
    await withRenderer(async (renderer) => {
      const render = (sub: string) =>
        renderer.render(
          renderCase(`d.bpm(120);
 d.synth("unison")${sub}
   .notes(60)
   .xox("1")
   .voices(3)
   .spread(24)
   .width(1)
   .noise("white", 0.2)
   .gain(0.4)
   .adsr(0, 0, 1, 0.1)
   .push();`),
        );
      const omitted = await render("");
      const silentSub = await render('.sub("square", -2, 0)');

      expect(
        compareAudio(audio(omitted), audio(silentSub), {
          tolerance: { maxError: 1e-6, rmsError: 1e-7 },
        }).passed,
      ).toBe(true);
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
