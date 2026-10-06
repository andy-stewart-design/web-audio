import { describe, expect, it } from "vitest";
import { COMPARISON_TOLERANCE } from "../audio";
import { compareAudio, formatComparison } from "../compare";

function audio(channels: readonly Float32Array[], sampleRate = 48_000) {
  return { sampleRate, channels };
}
const mono = (...samples: number[]) => audio([Float32Array.from(samples)]);

describe("raw audio comparison", () => {
  it("accepts identity, finite above-one peaks and a silent sibling channel without mutation", () => {
    const reference = audio([
      Float32Array.of(-2, 2, -0, 2 ** -149),
      new Float32Array(4),
    ]);
    const current = audio(reference.channels.map((channel) => channel.slice()));
    const before = current.channels.map((channel) =>
      Buffer.from(channel.buffer).toString("hex"),
    );
    const result = compareAudio(reference, current);
    expect(result.passed).toBe(true);
    expect(result.tolerance).toEqual(COMPARISON_TOLERANCE);
    expect(result.frameCount).toBe(4);
    expect(result.worst).toBeNull();
    expect(result.referenceMetrics[0]?.peak).toBe(2);
    expect(
      result.channels.map(({ maxError, rmsError }) => ({ maxError, rmsError })),
    ).toEqual([
      { maxError: 0, rmsError: 0 },
      { maxError: 0, rmsError: 0 },
    ]);
    expect(
      current.channels.map((channel) =>
        Buffer.from(channel.buffer).toString("hex"),
      ),
    ).toEqual(before);
    expect(formatComparison(result)).toContain("No sample differences.");
  });

  it("computes finite differences across the full finite float32 amplitude range", () => {
    const largest = Float32Array.of(3.4028234663852886e38)[0]!;
    const result = compareAudio(mono(largest), mono(-largest));
    expect(result.passed).toBe(false);
    expect(result.channels[0]?.maxError).toBe(2 * largest);
    expect(Number.isFinite(result.channels[0]?.rmsError)).toBe(true);
    expect(Number.isFinite(result.referenceMetrics[0]?.rms)).toBe(true);
  });

  it("rejects holes in either channel list rather than silently skipping coverage", () => {
    const sparse = new Array<Float32Array>(2);
    sparse[0] = Float32Array.of(1);
    const complete = audio([Float32Array.of(1), Float32Array.of(1)]);
    expect(() => compareAudio(audio(sparse), complete)).toThrow(
      "Reference: Audio channels must be Float32Arrays",
    );
    expect(() => compareAudio(complete, audio(sparse))).toThrow(
      "Current: Audio channels must be Float32Arrays",
    );
  });

  it.each([
    ["gain change", mono(1, -1, 0.5, -0.5), mono(0.5, -0.5, 0.25, -0.25)],
    ["one-frame shift", mono(1, 0, 0, 0), mono(0, 1, 0, 0)],
    ["polarity inversion", mono(1, -1), mono(-1, 1)],
    [
      "channel swap",
      audio([Float32Array.of(1, 0), Float32Array.of(0, 0.5)]),
      audio([Float32Array.of(0, 0.5), Float32Array.of(1, 0)]),
    ],
  ])(
    "rejects %s rather than aligning/normalizing channels or gain",
    (_name, reference, current) => {
      const result = compareAudio(reference, current);
      expect(result.passed).toBe(false);
      expect(result.channels.some((channel) => !channel.maxPassed)).toBe(true);
      expect(result.worst?.error).toBeGreaterThan(0);
    },
  );

  it("catches a single dropped transient through maximum error even when RMS passes", () => {
    const reference = new Float32Array(8_192).fill(0.25);
    reference[4_800] = 1.25;
    const current = new Float32Array(8_192).fill(0.25);
    const result = compareAudio(audio([reference]), audio([current]), {
      tolerance: { maxError: 0.5, rmsError: 0.02 },
    });
    expect(result.passed).toBe(false);
    expect(result.channels[0]).toMatchObject({
      maxError: 1,
      maxPassed: false,
      rmsPassed: true,
    });
    expect(result.channels[0]?.rmsError).toBe(Math.sqrt(1 / 8_192));
    expect(result.worst).toEqual({
      channel: 0,
      frame: 4_800,
      time: 0.1,
      error: 1,
      referenceValue: 1.25,
      currentValue: 0.25,
    });
  });

  it("reports per-channel metrics and first worst-error frame/time including initial silence", () => {
    const reference = audio(
      [Float32Array.of(1, 1, 1, 1), Float32Array.of(1, 1, 1, 1)],
      4,
    );
    const current = audio(
      [Float32Array.of(1, 1.25, 1, 1), Float32Array.of(1, 1, 1.5, 1.5)],
      4,
    );
    const result = compareAudio(reference, current);
    expect(result.channels[0]).toMatchObject({
      channel: 0,
      maxError: 0.25,
      rmsError: 0.125,
    });
    expect(result.channels[1]?.rmsError).toBe(Math.sqrt(0.5 / 4));
    expect(result.worst).toEqual({
      channel: 1,
      frame: 2,
      time: 0.5,
      error: 0.5,
      referenceValue: 1,
      currentValue: 1.5,
    });
    const report = formatComparison(result);
    expect(report).toContain(
      "Audio comparison FAILED: 4 Hz, 2 channels, 4 frames",
    );
    expect(report).toContain("Thresholds: max <= 0, RMS <= 0");
    expect(report).toContain("Channel 1: max=5.000000e-1 (FAIL)");
    expect(report).toContain("frame 2, time 0.500000000 s");
    expect(report).toContain("reference=1, current=1.5");
  });

  it("breaks global worst-error ties by first channel and frame", () => {
    const result = compareAudio(
      audio([Float32Array.of(1, 1), Float32Array.of(1, 1)]),
      audio([Float32Array.of(1.5, 1.5), Float32Array.of(1.5, 1.5)]),
    );
    expect(result.worst?.channel).toBe(0);
    expect(result.worst?.frame).toBe(0);
  });

  it.each([
    [{ maxError: 0.25, rmsError: 0.25 }, true, true, true],
    [{ maxError: 0.25 - Number.EPSILON, rmsError: 0.25 }, false, false, true],
    [{ maxError: 0.25, rmsError: 0.25 - Number.EPSILON }, false, true, false],
    [
      { maxError: 0.25 + Number.EPSILON, rmsError: 0.25 + Number.EPSILON },
      true,
      true,
      true,
    ],
  ])(
    "uses inclusive independent threshold boundaries: %j",
    (tolerance, passed, maxPassed, rmsPassed) => {
      const result = compareAudio(mono(1, 1), mono(1.25, 1.25), { tolerance });
      expect(result.passed).toBe(passed);
      expect(result.channels[0]).toMatchObject({
        maxError: 0.25,
        rmsError: 0.25,
        maxPassed,
        rmsPassed,
      });
      expect(result.tolerance).toEqual(tolerance);
      expect(result.tolerance).not.toBe(tolerance);
      expect(COMPARISON_TOLERANCE).toEqual({ maxError: 0, rmsError: 0 });
    },
  );

  it("does not silently relax zero defaults for a one-ULP change", () => {
    const result = compareAudio(mono(1), mono(1 + 2 ** -23));
    expect(result.passed).toBe(false);
    expect(result.channels[0]?.maxError).toBe(2 ** -23);
    expect(result.tolerance).toEqual({ maxError: 0, rmsError: 0 });
  });

  it.each([
    { maxError: -1, rmsError: 0 },
    { maxError: 0, rmsError: -1 },
    { maxError: Infinity, rmsError: 0 },
    { maxError: 0, rmsError: Infinity },
    { maxError: NaN, rmsError: 0 },
    { maxError: 0, rmsError: NaN },
  ])("rejects invalid tolerances %j", (tolerance) => {
    expect(() => compareAudio(mono(1), mono(1), { tolerance })).toThrow(
      /tolerance must be finite and non-negative/,
    );
  });

  it.each([
    [
      "rate mismatch",
      mono(1),
      audio([Float32Array.of(1)], 44_100),
      /Sample rate mismatch: reference 48000 Hz, current 44100 Hz/,
    ],
    [
      "channel mismatch",
      mono(1),
      audio([Float32Array.of(1), Float32Array.of(1)]),
      /Channel count mismatch: reference 1, current 2/,
    ],
    [
      "frame mismatch",
      mono(1),
      mono(1, 2),
      /Frame count mismatch: reference 1, current 2/,
    ],
    [
      "empty arrays",
      audio([]),
      audio([]),
      /Reference: Rendered audio is empty/,
    ],
    ["empty channels", mono(), mono(), /Reference: Rendered audio is empty/],
    [
      "reference ragged",
      audio([Float32Array.of(1), Float32Array.of(1, 2)]),
      audio([Float32Array.of(1), Float32Array.of(1)]),
      /Reference: Rendered channel lengths differ/,
    ],
    [
      "current ragged",
      audio([Float32Array.of(1), Float32Array.of(1)]),
      audio([Float32Array.of(1), Float32Array.of(1, 2)]),
      /Current: Rendered channel lengths differ/,
    ],
    [
      "invalid reference rate",
      audio([Float32Array.of(1)], 0),
      mono(1),
      /Reference sample rate/,
    ],
    [
      "invalid current rate",
      mono(1),
      audio([Float32Array.of(1)], NaN),
      /Current sample rate/,
    ],
  ])(
    "throws actionable input diagnostics: %s",
    (_name, reference, current, message) => {
      expect(() => compareAudio(reference, current)).toThrow(message);
    },
  );

  it.each([NaN, Infinity, -Infinity])(
    "rejects non-finite samples on either side: %s",
    (value) => {
      expect(() => compareAudio(mono(1, value), mono(1, 1))).toThrow(
        /Reference: Non-finite sample in channel 0 at frame 1/,
      );
      expect(() => compareAudio(mono(1, 1), mono(1, value))).toThrow(
        /Current: Non-finite sample in channel 0 at frame 1/,
      );
    },
  );

  it("requires explicit exact silence on both sides, independent of numerical tolerances", () => {
    expect(() => compareAudio(mono(0, -0), mono(0, 0))).toThrow(
      /Reference: Expected audible/,
    );
    expect(() => compareAudio(mono(1, 1), mono(0, 0))).toThrow(
      /Current: Expected audible/,
    );
    expect(() => compareAudio(mono(1e-10), mono(1e-10))).toThrow(/negligible/);
    expect(
      compareAudio(mono(0, -0), mono(0, 0), { expectSilence: true }).passed,
    ).toBe(true);
    expect(() =>
      compareAudio(mono(0), mono(1e-10), {
        expectSilence: true,
        tolerance: { maxError: 1, rmsError: 1 },
      }),
    ).toThrow(/Current: Expected silence/);
    expect(() =>
      compareAudio(mono(1), mono(0), { expectSilence: true }),
    ).toThrow(/Reference: Expected silence/);
  });
});
