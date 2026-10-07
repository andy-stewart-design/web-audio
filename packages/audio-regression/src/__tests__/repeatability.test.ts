import { describe, expect, it } from "vitest";
import { selectCase } from "../cases";
import { COMPARISON_TOLERANCE } from "../runner/audio";
import { withRenderer } from "../runner/render";
import { cases, estimateFrequency, sketch, windowPeak } from "./support/cases";
import { measureDifference } from "./support/repeatability";

const seeded = selectCase(cases, "seeded-multibar");
const alternate = selectCase(cases, "sample-alternate");

describe("seeded behavior and isolated audio repeatability", () => {
  it("measures known raw errors per channel and rejects invalid shapes/samples", () => {
    const reference = [Float32Array.of(1, 2), Float32Array.of(3, 4)];
    expect(
      measureDifference(reference, [
        Float32Array.of(1, 2),
        Float32Array.of(4, 4),
      ]),
    ).toEqual([
      { maxError: 0, rmsError: 0 },
      { maxError: 1, rmsError: Math.SQRT1_2 },
    ]);
    expect(
      measureDifference([Float32Array.of(1, 0)], [Float32Array.of(0, 1)]),
    ).toEqual([{ maxError: 1, rmsError: 1 }]);
    expect(() => measureDifference(reference, [])).toThrow("Channel count");
    expect(() =>
      measureDifference([Float32Array.of(1)], [Float32Array.of(1, 2)]),
    ).toThrow("Frame count");
    expect(() =>
      measureDifference([Float32Array.of(NaN)], [Float32Array.of(0)]),
    ).toThrow("Non-finite");
    expect(() =>
      measureDifference([Float32Array.of(1)], [Float32Array.of(Infinity)]),
    ).toThrow("Non-finite");
  });

  it("renders seeded chance hits/misses over three bars and responds to each seed", async () => {
    await withRenderer(async (renderer) => {
      const original = await renderer.render(seeded);
      const channel = original.channels[0];
      if (!channel) throw new Error("Missing audio");
      const activity = Array.from(
        { length: 24 },
        (_, step) =>
          windowPeak(
            channel,
            original.startTime + step * 0.25 + 0.06,
            0.08,
            48_000,
          ) > 0.05,
      );
      expect(activity.some(Boolean)).toBe(true);
      expect(activity.some((hit) => !hit)).toBe(true);
      for (let bar = 0; bar < 3; bar++)
        expect(activity.slice(bar * 8, (bar + 1) * 8).some(Boolean)).toBe(true);
      const noteSeed = await renderer.render({
        ...seeded,
        id: "different-note-seed",
        code: seeded.code.replace("ribbon(11)", "ribbon(12)"),
      });
      const chanceSeed = await renderer.render({
        ...seeded,
        id: "different-chance-seed",
        code: seeded.code.replace("ribbon(42)", "ribbon(99)"),
      });
      expect(
        measureDifference(original.channels, noteSeed.channels)[0]?.maxError,
      ).toBeGreaterThan(0.1);
      expect(
        measureDifference(original.channels, chanceSeed.channels)[0]?.maxError,
      ).toBeGreaterThan(0.1);
      const other = noteSeed.channels[0];
      if (!other) throw new Error("Missing audio");
      expect(
        activity.map(
          (_, step) =>
            windowPeak(
              other,
              original.startTime + step * 0.25 + 0.06,
              0.08,
              48_000,
            ) > 0.05,
        ),
      ).toEqual(activity);
      const changedTiming = chanceSeed.channels[0];
      if (!changedTiming) throw new Error("Missing audio");
      expect(
        activity.map(
          (_, step) =>
            windowPeak(
              changedTiming,
              original.startTime + step * 0.25 + 0.06,
              0.08,
              48_000,
            ) > 0.05,
        ),
      ).not.toEqual(activity);
    });
  });

  it("alternates real sample direction across bars and starts forward in fresh instances", async () => {
    await withRenderer(async (renderer) => {
      for (const bars of [2, 1, 2]) {
        const result = await renderer.render({ ...alternate, bars });
        const channel = result.channels[0];
        if (!channel) throw new Error("Missing audio");
        for (let hit = 0; hit < bars * 3; hit++) {
          const onset = result.startTime + hit * (2 / 3);
          const reverse = hit % 2 === 1;
          expect(
            estimateFrequency(
              channel,
              Math.round((onset + 0.025) * 48_000),
              Math.round((onset + 0.1) * 48_000),
              48_000,
            ),
          ).toBeCloseTo(reverse ? 880 : 440, 0);
          expect(windowPeak(channel, onset + 0.025, 0.075, 48_000)).toBeCloseTo(
            reverse ? 0.175 : 0.525,
            4,
          );
        }
        expect(renderer.browser.contexts()).toHaveLength(0);
      }
    });
  });

  it("measures raw synth/sample/LFO/seeded output across repeats, interference and fresh launches", async () => {
    const measurements = new Map<
      string,
      ReturnType<typeof measureDifference>
    >();
    const previous = await withRenderer(async (renderer) => {
      const baselines = new Map<
        string,
        Awaited<ReturnType<typeof renderer.render>>
      >();
      for (const input of cases)
        baselines.set(input.id, await renderer.render(input));
      const measure = (
        result: Awaited<ReturnType<typeof renderer.render>>,
        run: string,
      ) => {
        const baseline = baselines.get(result.id);
        if (!baseline) throw new Error(`Missing baseline: ${result.id}`);
        expect(result.settings).toEqual(baseline.settings);
        expect(result.frameCount).toBe(baseline.frameCount);
        expect(result.bpm).toBe(baseline.bpm);
        expect(result.bars).toBe(baseline.bars);
        expect(result.tailSeconds).toBe(baseline.tailSeconds);
        expect(result.browserVersion).toBe(baseline.browserVersion);
        const errors = measureDifference(baseline.channels, result.channels);
        measurements.set(`${result.id}/${run}`, errors);
        for (const { maxError, rmsError } of errors) {
          expect(
            maxError,
            `${result.id}/${run}: maximum error`,
          ).toBeLessThanOrEqual(COMPARISON_TOLERANCE.maxError);
          expect(
            rmsError,
            `${result.id}/${run}: RMS error`,
          ).toBeLessThanOrEqual(COMPARISON_TOLERANCE.rmsError);
        }
      };
      for (const input of cases) {
        measure(await renderer.render(input), "same-order");
        expect(renderer.browser.contexts()).toHaveLength(0);
      }
      // Odd hit count leaves the previous sampler ready to reverse. Reusing the
      // logical URL with different bytes also exposes a stale shared file cache.
      await renderer.render({ ...alternate, bars: 1 });
      const differentAsset = await renderer.render({
        ...alternate,
        id: "different-asset",
        bars: 1,
        resources: {
          "/samples/asymmetric.wav": "cases/sample-tone/samples/tone.wav",
        },
      });
      expect(differentAsset.metrics[0]?.peak).toBeCloseTo(0.437513, 4);
      const silent = await renderer.render(
        sketch({ id: "after-voices", code: "", expectSilence: true }),
      );
      expect(silent.metrics.every(({ peak }) => peak === 0)).toBe(true);
      for (const input of [...cases].reverse()) {
        measure(await renderer.render(input), "reversed-order");
        expect(renderer.browser.contexts()).toHaveLength(0);
      }
      return { measure, browser: renderer.browser };
    });
    expect(previous.browser.isConnected()).toBe(false);
    await withRenderer(async (renderer) => {
      expect(renderer.browser).not.toBe(previous.browser);
      for (const input of [...cases].reverse()) {
        previous.measure(await renderer.render(input), "fresh-browser");
        expect(renderer.browser.contexts()).toHaveLength(0);
      }
    });
    console.table(
      [...measurements].map(([run, errors]) => ({
        run,
        maxError: Math.max(...errors.map((error) => error.maxError)),
        rmsError: Math.max(...errors.map((error) => error.rmsError)),
      })),
    );
    expect(measurements.size).toBe(cases.length * 3);
  }, 60_000);
});
