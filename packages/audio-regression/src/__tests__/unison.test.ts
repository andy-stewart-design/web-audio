import { readFile } from "node:fs/promises";
import { evaluateSource } from "@web-audio/fluid";
import { describe, expect, it } from "vitest";
import { compareAudio } from "../runner/compare";
import { withRenderer } from "../runner/render";
import type { SketchCase } from "../types";

function unisonCode(
  options: {
    selector?: "unison" | "uni";
    shape?: "saw" | "sawtooth";
    voices?: string;
    spread?: string;
    width?: string;
    detune?: string;
    notes?: string;
    pattern?: string;
  } = {},
) {
  const {
    selector = "unison",
    shape,
    voices = "2",
    spread = "12",
    width = "0.8",
    detune = "0",
    notes = "60",
    pattern = "[0, 0, 1]",
  } = options;
  const type = shape === undefined ? "" : `.type("${shape}")`;
  return `d.bpm(137);
d.synth("${selector}")${type}
  .notes(${notes})
  .xox(${pattern})
  .voices(${voices})
  .spread(${spread})
  .width(${width})
  .detune(${detune})
  .gain(0.4)
  .adsr(0, 0, 1, 0.1)
  .push();`;
}

function nativeCase(
  code: string,
  settings: Pick<
    NonNullable<SketchCase["settings"]>,
    "sampleRate" | "channels"
  > = {
    sampleRate: 48_000,
    channels: 2,
  },
): SketchCase {
  return {
    id: "unison-native",
    description: "Temporary native saw-only unison fixture",
    code,
    bars: 1,
    tailSeconds: 0.5,
    settings: {
      ...settings,
      startOffsetFrames: 4_800,
    },
  };
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

type NativeRender = Awaited<
  ReturnType<Parameters<Parameters<typeof withRenderer>[0]>[0]["render"]>
>;

function audio(result: NativeRender) {
  return {
    sampleRate: result.settings.sampleRate,
    channels: result.channels,
  };
}

function expectHealthy(result: NativeRender) {
  expect(
    result.channels.every((channel) => channel.every(Number.isFinite)),
  ).toBe(true);
  expect(maxAbs(result.channels)).toBeGreaterThan(1e-5);
}

describe("native saw-only unison", () => {
  it("resolves diagnostic passages across each control pattern", async () => {
    const code = await readFile(
      new URL("../../cases/unison/sketch.js", import.meta.url),
      "utf8",
    );
    const instrument = evaluateSource(code).instruments[0]!;

    expect(instrument.eventPattern.timing.cycle[0]).toHaveLength(4);
    if (!("engine" in instrument) || instrument.engine !== "unison")
      throw new Error("Expected unison");
    expect(instrument.voices).toMatchObject({
      type: "static",
      cycle: [[1, 2, 7, 8]],
    });
    expect(instrument.spread).toMatchObject({
      type: "static",
      cycle: [[0, 12, 24, 36]],
    });
    expect(instrument.width).toMatchObject({
      type: "static",
      cycle: [[0, 0.4, 0.8, 1]],
    });
  });

  it.each([44_100, 48_000])(
    "renders both aliases and saw selection with sample-aligned lifetime at %i Hz",
    async (sampleRate) => {
      await withRenderer(async (renderer) => {
        const results = await Promise.all([
          renderer.render(
            nativeCase(unisonCode(), { sampleRate, channels: 2 }),
          ),
          renderer.render(
            nativeCase(unisonCode({ selector: "uni", shape: "sawtooth" }), {
              sampleRate,
              channels: 2,
            }),
          ),
        ]);
        const result = results[0]!;
        const alias = results[1]!;
        expectHealthy(result);
        expectHealthy(alias);
        expect(
          compareAudio(audio(result), audio(alias), {
            tolerance: { maxError: 1e-6, rmsError: 1e-7 },
          }).passed,
        ).toBe(true);

        const eventStart = Math.ceil(
          (result.startTime + (2 / 3) * result.barDuration) * sampleRate,
        );
        const eventDuration = result.barDuration / 3;
        const sourceStop = Math.ceil(
          (result.startTime + result.barDuration + 0.1 * eventDuration + 0.05) *
            sampleRate,
        );
        const blockStart = Math.floor(eventStart / 128) * 128;
        const blockEnd = blockStart + 128;
        expect(eventStart).toBeGreaterThan(blockStart);
        expect(eventStart).toBeLessThan(blockEnd);
        expect(result.frameCount).toBeGreaterThan(sourceStop);
        for (const channel of result.channels) {
          expect(
            channel
              .subarray(blockStart, eventStart)
              .every((value) => value === 0),
          ).toBe(true);
          expect(
            channel
              .subarray(eventStart, blockEnd)
              .some((value) => Math.abs(value) > 1e-8),
          ).toBe(true);
          expect(
            channel.subarray(sourceStop).every((value) => value === 0),
          ).toBe(true);
        }
        expect(renderer.browser.contexts()).toHaveLength(0);
      });
    },
  );

  it("keeps width independent from tuning and downmixes to mono", async () => {
    await withRenderer(async (renderer) => {
      const centered = await renderer.render(
        nativeCase(unisonCode({ width: "0", spread: "12" })),
      );
      const wide = await renderer.render(
        nativeCase(unisonCode({ width: "1", spread: "12" })),
      );
      const mono = await renderer.render(
        nativeCase(unisonCode({ width: "1", spread: "12" }), {
          sampleRate: 48_000,
          channels: 1,
        }),
      );
      const extreme = await renderer.render(
        nativeCase(unisonCode({ width: "1e100", spread: "1e100" })),
      );

      expectHealthy(centered);
      expectHealthy(wide);
      expectHealthy(mono);
      expectHealthy(extreme);
      expect(maxChannelDifference(centered.channels)).toBeLessThan(1e-6);
      expect(maxChannelDifference(wide.channels)).toBeGreaterThan(1e-5);
      expect(mono.channels).toHaveLength(1);
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });

  it("renders bounded count/detune changes and evolving source automation", async () => {
    await withRenderer(async (renderer) => {
      const one = await renderer.render(
        nativeCase(
          unisonCode({ voices: "1", spread: "0", width: "0", detune: "0" }),
        ),
      );
      const eight = await renderer.render(
        nativeCase(
          unisonCode({
            voices: "8",
            spread: "24",
            width: "1",
            detune: "17",
          }),
        ),
      );
      const evolving = await renderer.render(
        nativeCase(
          unisonCode({
            voices: "[1, 2, 7, 8]",
            spread: "[0, 12, 24, 0]",
            width: "[0, 0.4, 1, 0.2]",
            notes: "[60, 64, 67, 72]",
            pattern: "[1, 1, 1, 1]",
          }),
        ),
      );

      expectHealthy(one);
      expectHealthy(eight);
      expectHealthy(evolving);
      expect(
        compareAudio(audio(one), audio(eight), {
          tolerance: { maxError: 1e-5, rmsError: 1e-6 },
        }).passed,
      ).toBe(false);
      expect(maxChannelDifference(evolving.channels)).toBeGreaterThan(1e-5);
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });

  it("repeats fresh renders without ambient phase variation", async () => {
    await withRenderer(async (renderer) => {
      const input = nativeCase(
        unisonCode({ voices: "7", spread: "[0, 24]", width: "[0.2, 0.9]" }),
      );
      const first = await renderer.render(input);
      const second = await renderer.render(input);
      expectHealthy(first);
      expectHealthy(second);
      expect(
        compareAudio(audio(first), audio(second), {
          tolerance: { maxError: 1e-6, rmsError: 1e-7 },
        }).passed,
      ).toBe(true);
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });
});
