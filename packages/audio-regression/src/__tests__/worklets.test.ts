import { describe, expect, it } from "vitest";
import { cases, selectCase } from "../cases";
import { withRenderer } from "../runner/render";
import { sketch, windowPeak } from "./support/cases";
import { measureDifference } from "./support/repeatability";
import {
  throwingConstructor,
  throwingLateProcessor,
  throwingProcessor,
  withBrokenWorklet,
} from "./support/worklet-failures";

const filtered = selectCase(cases, "lfo-filter");
const gainLfo =
  "d.synth('sine').notes(69).gain(0.5).adsr(0.01, 0, 1, 0.05).fx(d.gain(d.lfo(0.5, 0.5).wave('sine').speed(1).off(0.25))).push();";

describe("real LFO processing", () => {
  it("changes filtered audio and updates endpoints at the second bar, not the first", async () => {
    await withRenderer(async (renderer) => {
      const modulated = await renderer.render(filtered);
      const staticControl = await renderer.render({
        ...filtered,
        id: "static-filter",
        code: filtered.code.replace(
          "d.lfo([300, 900], [2500, 4500]).norm().wave('sine').speed(1).off(0.25)",
          "1400",
        ),
      });
      expect(
        measureDifference(staticControl.channels, modulated.channels)[0]
          ?.rmsError,
      ).toBeGreaterThan(0.005);
      const frozenEndpoints = await renderer.render({
        ...filtered,
        id: "fixed-endpoints",
        code: filtered.code.replace("[300, 900], [2500, 4500]", "300, 2500"),
      });
      const actual = modulated.channels[0];
      const frozen = frozenEndpoints.channels[0];
      if (!actual || !frozen) throw new Error("Missing audio");
      const boundary = modulated.settings.startOffsetFrames + 2 * 48_000;
      expect(
        measureDifference(
          [actual.slice(0, boundary)],
          [frozen.slice(0, boundary)],
        )[0]?.maxError,
      ).toBe(0);
      expect(
        measureDifference([actual.slice(boundary)], [frozen.slice(boundary)])[0]
          ?.rmsError,
      ).toBeGreaterThan(0.005);
      expect(
        actual
          .slice(0, modulated.settings.startOffsetFrames)
          .every((sample) => sample === 0),
      ).toBe(true);
      expect(windowPeak(actual, 4.22, 0.025, 48_000)).toBeLessThan(1e-8);
    });
  });

  it.each([
    { sampleRate: 48_000, startOffsetFrames: 4_837 },
    { sampleRate: 44_100, startOffsetFrames: 4_417 },
  ])(
    "locks gain-LFO phase to authored origin across partial quanta: %j",
    async (settings) => {
      await withRenderer(async (renderer) => {
        const control = await renderer.render(sketch({ settings }));
        const modulated = await renderer.render(
          sketch({ id: "gain-lfo", code: gainLfo, settings }),
        );
        const carrier = control.channels[0];
        const actual = modulated.channels[0];
        if (!carrier || !actual) throw new Error("Missing audio");
        const { sampleRate, startOffsetFrames } = modulated.settings;
        const periodFrames = modulated.barDuration * sampleRate;
        expect(startOffsetFrames % 128).not.toBe(0);
        expect(
          actual.slice(0, startOffsetFrames).every((sample) => sample === 0),
        ).toBe(true);
        // Native carrier is the control. Only the known sine gain is analytical;
        // this tests processor phase/origin rather than duplicating scheduling.
        for (const seconds of [0.027, 0.123, 0.502, 0.999, 1.249, 1.777]) {
          const offset = Math.round(seconds * sampleRate);
          for (let delta = -20; delta <= 20; delta++) {
            const frame = startOffsetFrames + offset + delta;
            const gain =
              0.5 +
              0.5 * Math.cos((2 * Math.PI * (offset + delta)) / periodFrames);
            expect(
              Math.abs(actual[frame]! - carrier[frame]! * gain),
            ).toBeLessThan(1e-6);
          }
        }
      });
    },
  );

  it.each([
    ["registration", "const = ;", /worklet|module|Unexpected token/i],
    [
      "construction",
      throwingConstructor,
      /AudioWorklet processorerror: lfo-processor.*constructor failed/,
    ],
    [
      "processing",
      throwingProcessor,
      /AudioWorklet processorerror: lfo-processor.*deliberate processor failure/,
    ],
    [
      "late-processing",
      throwingLateProcessor,
      /AudioWorklet processorerror: lfo-processor.*deliberate late processor failure/,
    ],
  ])(
    "rejects native %s failure alongside a healthy voice and recovers",
    async (kind, moduleSource, message) => {
      await withRenderer(async (renderer) => {
        await expect(
          renderer
            .render({
              ...filtered,
              id: `failed-${kind}`,
              bars: kind === "late-processing" ? 1 : filtered.bars,
              tailSeconds:
                kind === "late-processing" ? 0 : filtered.tailSeconds,
              code: withBrokenWorklet(filtered.code, moduleSource),
            })
            .then(() => undefined),
        ).rejects.toThrow(message);
        expect(renderer.browser.contexts()).toHaveLength(0);
        const recovered = await renderer.render(filtered);
        expect(recovered.metrics[0]?.rms).toBeGreaterThan(0.01);
        expect(renderer.browser.contexts()).toHaveLength(0);
      });
    },
  );
});
