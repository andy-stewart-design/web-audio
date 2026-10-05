import { evaluateSource } from "@web-audio/fluid";
import { describe, expect, it } from "vitest";
import { cases, selectCase } from "../cases";
import { withRenderer } from "../runner/render";
import type { SketchCase } from "../types";
import { estimateFrequency, sketch, windowPeak } from "./support/cases";

const toneSource = "/samples/tone.wav";
const asymmetricSource = "/samples/asymmetric.wav";
const sampleVoice = "d.sample('hit').bank('local').clip(false).push();";
const manifest = (source: string) =>
  `d.loadSamples({bank: 'local', samples: {hit: [${JSON.stringify(source)}]}});`;
const healthyVoice = "d.synth('sine').notes(69).gain(0.5).push();";

function sampleSketch(
  code: string,
  resources: SketchCase["resources"] = {
    [asymmetricSource]: "resources/asymmetric.wav",
  },
) {
  return sketch({ id: "sample", code, resources });
}

describe("real local sampler rendering", () => {
  it("fetches/decodes a local PCM sample and plays its actual pitch/duration", async () => {
    await withRenderer(async (renderer) => {
      const result = await renderer.render(selectCase(cases, "sample-tone"));
      const audio = result.channels[0]!;
      expect(result.channels).toHaveLength(2);
      expect(result.frameCount).toBe(105_600);
      expect(audio.slice(0, 4_800).every((value) => value === 0)).toBe(true);
      expect(result.metrics[0]?.peak).toBeCloseTo(0.4375, 4);
      expect(estimateFrequency(audio, 9_600, 24_000, 48_000)).toBeCloseTo(
        440,
        0,
      );
      expect(windowPeak(audio, 0.3, 0.1, 48_000)).toBeGreaterThan(0.4);
      expect(windowPeak(audio, 0.65, 1, 48_000)).toBe(0);
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });

  it("reverses unequal sample ends through the engine's real reversal cache", async () => {
    await withRenderer(async (renderer) => {
      const forward = await renderer.render(
        sampleSketch(manifest(asymmetricSource) + sampleVoice),
      );
      const reverse = await renderer.render(
        selectCase(cases, "sample-reverse"),
      );
      const a = forward.channels[0]!;
      const b = reverse.channels[0]!;
      expect(windowPeak(a, 0.12, 0.05, 48_000)).toBeCloseTo(0.525, 3);
      expect(windowPeak(a, 0.5, 0.05, 48_000)).toBeCloseTo(0.175, 3);
      expect(windowPeak(b, 0.12, 0.05, 48_000)).toBeCloseTo(0.175, 3);
      expect(windowPeak(b, 0.5, 0.05, 48_000)).toBeCloseTo(0.525, 3);
      expect(windowPeak(a, 0.26, 0.18, 48_000)).toBe(0);
      expect(windowPeak(b, 0.26, 0.18, 48_000)).toBe(0);
    });
  });

  it.each([
    manifest(asymmetricSource) +
      "d.sample('hit').bank('local').start(0.75).end(1).clip(false).push();",
    manifest(asymmetricSource) +
      "d.sample('hit').bank('local').start(0.75).end(1).direction('reverse').clip(false).push();",
    `d.loadSamples({bank: 'local', src: '${asymmetricSource}', samples: {hit: [[0.75, 1]]}});` +
      sampleVoice,
  ])(
    "plays the selected region rather than the whole file: %s",
    async (code) => {
      await withRenderer(async (renderer) => {
        const result = await renderer.render(sampleSketch(code));
        const audio = result.channels[0]!;
        expect(result.metrics[0]?.peak).toBeCloseTo(0.175, 3);
        expect(estimateFrequency(audio, 5_760, 9_600, 48_000)).toBeCloseTo(
          880,
          0,
        );
        expect(windowPeak(audio, 0.3, 0.4, 48_000)).toBe(0);
      });
    },
  );

  it("maps only explicitly selected built-in sample URLs to local files", async () => {
    const code = "d.sample('bd').clip(false).push();";
    const schema = evaluateSource(code);
    const instrument = schema.instruments[0];
    if (!instrument || instrument.type !== "sampler")
      throw new Error("No sampler");
    const sources = schema.banks[instrument.bank]?.samples.bd;
    if (!sources) throw new Error("No built-in bd sources");
    const resources = Object.fromEntries(
      Object.values(sources)
        .flat()
        .map((entry) => [entry.src, "resources/tone.wav"]),
    );
    await withRenderer(async (renderer) => {
      const result = await renderer.render(sampleSketch(code, resources));
      expect(result.metrics[0]?.peak).toBeCloseTo(0.4375, 4);
      expect(
        estimateFrequency(result.channels[0]!, 9_600, 24_000, 48_000),
      ).toBeCloseTo(440, 0);
    });
  });

  it.each([
    [
      manifest(toneSource) + sampleVoice,
      { [toneSource]: "resources/no-such-file.wav" },
      /HTTP 404[\s\S]*no-such-file.wav/,
    ],
    [
      manifest(toneSource) + sampleVoice,
      { [toneSource]: "src/__tests__/support/not-audio.txt" },
      /\[Sampler\] Failed to load/,
    ],
    [
      manifest("https://audio-regression.invalid/sample.wav") + sampleVoice,
      {},
      /Blocked external request/,
    ],
    [manifest("/missing-unmapped.wav") + sampleVoice, {}, /HTTP 404/],
    ["d.sample('hit').bank('absent').push();", {}, /Bank "absent" not found/],
    [
      manifest(toneSource) + "d.sample('absent').bank('local').push();",
      { [toneSource]: "resources/tone.wav" },
      /Sample "absent" not found/,
    ],
    [
      "d.loadSamples({bank: 'local', samples: {hit: []}});" + sampleVoice,
      {},
      /No entries found/,
    ],
    [
      manifest(toneSource) +
        "d.sample('hit').bank('local').start(0.9).end(0.2).push();",
      { [toneSource]: "resources/tone.wav" },
      /start\(\) must be less than end/,
    ],
  ])(
    "rejects loading/resource failures alongside a healthy voice: %s",
    async (code, resources, message) => {
      await withRenderer(async (renderer) => {
        expect(
          (await renderer.render(sketch({ code: healthyVoice }))).metrics[0]
            ?.rms,
        ).toBeGreaterThan(0.1);
        await expect(
          renderer
            .render(sampleSketch(code + healthyVoice, resources))
            .then(() => undefined),
        ).rejects.toThrow(message);
        expect(renderer.browser.contexts()).toHaveLength(0);
        // The next healthy sample must not inherit a failed cache/resource mount.
        expect(
          (await renderer.render(selectCase(cases, "sample-tone"))).metrics[0]
            ?.peak,
        ).toBeCloseTo(0.4375, 4);
      });
    },
  );

  it("preloads only the selected variation, not an unused external entry", async () => {
    const code = `d.loadSamples({bank: 'local', samples: {hit: ['https://audio-regression.invalid/unused.wav', '${asymmetricSource}']}}); d.sample('hit', 1).bank('local').clip(false).push();`;
    await withRenderer(async (renderer) => {
      const result = await renderer.render(sampleSketch(code));
      expect(result.metrics[0]?.peak).toBeCloseTo(0.525, 3);
      expect(windowPeak(result.channels[0]!, 0.5, 0.05, 48_000)).toBeCloseTo(
        0.175,
        3,
      );
    });
  });

  it("rejects a corrupt sampler alongside a separately healthy sampler", async () => {
    const code = `d.loadSamples({bank: 'local', samples: {good: ['${toneSource}'], bad: ['/samples/bad.wav']}}); d.sample('good').bank('local').push(); d.sample('bad').bank('local').push();`;
    await withRenderer(async (renderer) => {
      await expect(
        renderer
          .render(
            sampleSketch(code, {
              [toneSource]: "resources/tone.wav",
              "/samples/bad.wav": "src/__tests__/support/not-audio.txt",
            }),
          )
          .then(() => undefined),
      ).rejects.toThrow(/\[Sampler\] Failed to load/);
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });

  it("blocks external requests originating in an authored worker", async () => {
    const workerCode =
      "fetch('https://audio-regression.invalid/worker.wav').catch(() => {});";
    const code = `new Worker(URL.createObjectURL(new Blob([${JSON.stringify(workerCode)}], {type: 'text/javascript'})));`;
    await withRenderer(async (renderer) => {
      await expect(
        renderer
          .render(sampleSketch(code + manifest(asymmetricSource) + sampleVoice))
          .then(() => undefined),
      ).rejects.toThrow(/Blocked external request.*worker.wav/);
      expect(renderer.browser.contexts()).toHaveLength(0);
    });
  });
});
