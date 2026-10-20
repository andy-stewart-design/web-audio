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

function isolatedNoise(
  result: { channels: Float32Array[] },
  mainOnly: { channels: Float32Array[] },
) {
  return channelDifference(result.channels[0]!, mainOnly.channels[0]!);
}

function windowRms(
  channel: Float32Array,
  start: number,
  sampleRate: number,
  offsetSeconds: number,
  durationSeconds: number,
) {
  const offset = Math.round(offsetSeconds * sampleRate);
  const length = Math.round(durationSeconds * sampleRate);
  return rms(channel, start + offset, start + offset + length);
}

describe("native noise integration", () => {
  it("renders both engines/colors and consumes zero, envelope, and LFO gain", async () => {
    await withRenderer(async (renderer) => {
      for (const engine of ["sine", "unison"] as const) {
        const absent = await renderer.render(
          noiseSketch(`${engine}-absent`, synthCode(engine)),
        );
        const reference = await renderer.render(
          noiseSketch(`${engine}-reference`, synthCode(engine, '"white", 1')),
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
            }.notes(60).gain(0.2).adsr(0, 0, 1, 0.05).noise(d.env(0, 1).adsr(0.2, 0, 1, 0.1)).push();`,
          ),
        );
        const lfo = await renderer.render(
          noiseSketch(
            `${engine}-lfo`,
            `${
              engine === "unison"
                ? 'd.synth("unison").voices(2)'
                : 'd.synth("sine")'
            }.notes(60).gain(0.2).adsr(0, 0, 1, 0.05).noise(d.lfo(0, 1).norm().speed(1)).push();`,
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

        const sampleRate = white.settings?.sampleRate ?? 48_000;
        const referenceNoise = isolatedNoise(reference, absent);
        const envelopeNoise = isolatedNoise(envelope, absent);
        const lfoNoise = isolatedNoise(lfo, absent);
        const envelopeEarly = windowRms(
          envelopeNoise,
          start,
          sampleRate,
          0.05,
          0.1,
        );
        const envelopeLate = windowRms(
          envelopeNoise,
          start,
          sampleRate,
          0.65,
          0.1,
        );
        const referenceEarly = windowRms(
          referenceNoise,
          start,
          sampleRate,
          0.05,
          0.1,
        );
        const referenceLate = windowRms(
          referenceNoise,
          start,
          sampleRate,
          0.65,
          0.1,
        );
        expect(envelopeEarly / referenceEarly).toBeLessThan(0.4);
        expect(envelopeLate / referenceLate).toBeGreaterThan(0.8);

        const lfoLevels = [0.1, 0.5, 0.9].map(
          (offset) =>
            windowRms(lfoNoise, start, sampleRate, offset, 0.1) /
            windowRms(referenceNoise, start, sampleRate, offset, 0.1),
        );
        expect(Math.max(...lfoLevels) - Math.min(...lfoLevels)).toBeGreaterThan(
          0.2,
        );
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

  it("keeps sampler noise audible through sample release, then stops", async () => {
    const directory = await mkdtemp(join(process.cwd(), ".noise-release-"));
    const file = join(directory, "short.wav");
    const sampleFrames = 4_800;
    await writeFile(
      file,
      encodeWav({
        sampleRate: 48_000,
        channels: [
          Float32Array.from(
            { length: sampleFrames },
            (_, frame) => 0.25 * Math.sin((2 * Math.PI * 220 * frame) / 48_000),
          ),
        ],
      }),
    );

    try {
      await withRenderer(async (renderer) => {
        const result = await renderer.render(
          noiseSketch(
            "sampler-release",
            `
              d.loadSamples({bank: "local", samples: {hit: ["/samples/short.wav"]}});
              d.sample("hit").bank("local").clip(false).gain(0.3)
                .adsr(0, 0, 1, 1).noise("pink", 0.2).push();
            `,
            {
              tailSeconds: 0.8,
              resources: { "/samples/short.wav": file },
            },
          ),
        );
        const sampleEnd =
          (result.settings?.startOffsetFrames ?? 4_800) + sampleFrames;
        const sampleRate = result.settings?.sampleRate ?? 48_000;
        const channel = result.channels[0]!;

        expect(
          rms(channel, sampleEnd + 2_400, sampleEnd + 7_200),
        ).toBeGreaterThan(1e-4);
        expect(
          maxAbs(
            channel,
            sampleEnd + Math.round(sampleRate * 0.3),
            sampleEnd + Math.round(sampleRate * 0.4),
          ),
        ).toBeLessThan(1e-7);
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
