import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { encodeWav } from "../runner/wav";
import { withRenderer } from "../runner/render";
import type { SketchCase } from "../types";
import { channelDifference, maxAbs, maxDifference, rms } from "./support/noise";
import {
  throwingNoiseProcessor,
  withBrokenNoiseWorklet,
} from "./support/worklet-failures";

function noiseSketch(
  id: string,
  code: string,
  overrides: Partial<SketchCase> = {},
): SketchCase {
  return {
    id,
    description: `Native noise diagnostic: ${id}`,
    code,
    bars: 1,
    tailSeconds: 0.3,
    settings: { channels: 2, sampleRate: 48_000, startOffsetFrames: 4_800 },
    ...overrides,
  };
}

function synthCode(engine: "sine" | "unison", noise?: string) {
  const instrument =
    engine === "unison" ? `d.synth("unison").voices(2)` : `d.synth("sine")`;
  const noiseLayer = noise === undefined ? "" : `.noise(${noise})`;
  return `${instrument}.notes(60).gain(0.2).adsr(0, 0, 1, 0.05)${noiseLayer}.push();`;
}

function activeRange(result: {
  settings: SketchCase["settings"];
  channels: Float32Array[];
}) {
  const start = result.settings?.startOffsetFrames ?? 0;
  const sampleRate = result.settings?.sampleRate ?? 48_000;
  return [start, start + sampleRate] as const;
}

function tailPeak(result: {
  settings: SketchCase["settings"];
  channels: Float32Array[];
}) {
  const sampleRate = result.settings?.sampleRate ?? 48_000;
  const length = result.channels[0]?.length ?? 0;
  const start = Math.max(0, length - Math.round(sampleRate * 0.05));
  return Math.max(...result.channels.map((channel) => maxAbs(channel, start)));
}

describe("native noise integration", () => {
  it("renders both engines/colors and consumes zero, envelope, and LFO gain", async () => {
    await withRenderer(async (renderer) => {
      for (const engine of ["sine", "unison"] as const) {
        const absent = await renderer.render(
          noiseSketch(`${engine}-absent`, synthCode(engine)),
        );
        const zero = await renderer.render(
          noiseSketch(`${engine}-zero`, synthCode(engine, '"white", 0')),
        );
        const white = await renderer.render(
          noiseSketch(`${engine}-white`, synthCode(engine, '"white", 0.2')),
        );
        const pink = await renderer.render(
          noiseSketch(`${engine}-pink`, synthCode(engine, '"pink", 0.2')),
        );
        const envelope = await renderer.render(
          noiseSketch(
            `${engine}-envelope`,
            `${
              engine === "unison"
                ? 'd.synth("unison").voices(2)'
                : 'd.synth("sine")'
            }.notes(60).gain(0.2).noise(d.env(0, 1).adsr(0.01, 0.1, 1, 0.1)).push();`,
          ),
        );
        const lfo = await renderer.render(
          noiseSketch(
            `${engine}-lfo`,
            `${
              engine === "unison"
                ? 'd.synth("unison").voices(2)'
                : 'd.synth("sine")'
            }.notes(60).gain(0.2).noise(d.lfo(0, 0.4).norm().speed(1)).push();`,
          ),
        );

        const [start, end] = activeRange(absent);
        expect(
          maxDifference(absent.channels[0]!, zero.channels[0]!, start, end),
        ).toBeLessThan(1e-6);
        expect(rms(white.channels[0]!, start, end)).toBeGreaterThan(1e-4);
        expect(rms(pink.channels[0]!, start, end)).toBeGreaterThan(1e-4);
        expect(
          maxDifference(white.channels[0]!, pink.channels[0]!, start, end),
        ).toBeGreaterThan(1e-4);
        expect(
          maxDifference(white.channels[0]!, envelope.channels[0]!, start, end),
        ).toBeGreaterThan(1e-5);
        expect(
          maxDifference(white.channels[0]!, lfo.channels[0]!, start, end),
        ).toBeGreaterThan(1e-5);
        expect(tailPeak(white)).toBeLessThan(1e-7);
        expect(renderer.browser.contexts()).toHaveLength(0);
      }
    });
  });

  it("preserves stereo main-source identity while adding sampler noise", async () => {
    const directory = await mkdtemp(join(process.cwd(), ".noise-native-"));
    const file = join(directory, "stereo.wav");
    const frames = 4_800;
    const stereoWav = encodeWav({
      sampleRate: 48_000,
      channels: [
        Float32Array.from(
          { length: frames },
          (_, frame) => 0.25 * Math.sin((2 * Math.PI * 220 * frame) / 48_000),
        ),
        Float32Array.from(
          { length: frames },
          (_, frame) => 0.25 * Math.sin((2 * Math.PI * 330 * frame) / 48_000),
        ),
      ],
    });
    await writeFile(file, stereoWav);

    const code = (noise: string) => `
      d.loadSamples({bank: "local", samples: {hit: ["/samples/stereo.wav"]}});
      d.sample("hit").bank("local").loop().gain(0.3).noise(${noise}).push();
    `;
    try {
      await withRenderer(async (renderer) => {
        const absent = await renderer.render(
          noiseSketch("sampler-absent", code("0"), {
            resources: { "/samples/stereo.wav": file },
          }),
        );
        const withNoise = await renderer.render(
          noiseSketch("sampler-noise", code('"pink", 0.2'), {
            resources: { "/samples/stereo.wav": file },
          }),
        );
        const [start, end] = activeRange(absent);
        const absentStereo = channelDifference(
          absent.channels[0]!,
          absent.channels[1]!,
        );
        const noiseStereo = channelDifference(
          withNoise.channels[0]!,
          withNoise.channels[1]!,
        );

        expect(
          maxDifference(absentStereo, noiseStereo, start, end),
        ).toBeLessThan(1e-6);
        expect(
          maxDifference(
            absent.channels[0]!,
            withNoise.channels[0]!,
            start,
            end,
          ),
        ).toBeGreaterThan(1e-4);
        expect(tailPeak(withNoise)).toBeLessThan(1e-7);
        expect(renderer.browser.contexts()).toHaveLength(0);
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("repeats the default stream across fresh contexts and start offsets", async () => {
    await withRenderer(async (renderer) => {
      const code = synthCode("sine", '"white", 0.2');
      const first = await renderer.render(noiseSketch("repeat-a", code));
      const second = await renderer.render(noiseSketch("repeat-b", code));
      const shifted = await renderer.render(
        noiseSketch("repeat-shifted", code, {
          settings: { channels: 2, startOffsetFrames: 9_600 },
        }),
      );
      const [start, end] = activeRange(first);
      expect(
        maxDifference(first.channels[0]!, second.channels[0]!, start, end),
      ).toBe(0);
      const shiftedStart = shifted.settings.startOffsetFrames ?? 9_600;
      expect(
        maxDifference(
          first.channels[0]!.subarray(start, end),
          shifted.channels[0]!.subarray(
            shiftedStart,
            shiftedStart + (end - start),
          ),
        ),
      ).toBeLessThan(1e-5);
    });
  });

  it("rejects targeted noise processor failures and recovers cleanly", async () => {
    await withRenderer(async (renderer) => {
      const code = synthCode("sine", '"white", 0.2');
      await expect(
        renderer
          .render(
            noiseSketch(
              "noise-failure",
              withBrokenNoiseWorklet(code, throwingNoiseProcessor),
            ),
          )
          .then(() => undefined),
      ).rejects.toThrow(/deliberate noise processor failure/);
      expect(renderer.browser.contexts()).toHaveLength(0);

      const recovered = await renderer.render(
        noiseSketch("noise-recovered", code),
      );
      expect(recovered.metrics.some(({ rms }) => rms > 0)).toBe(true);
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });
});
