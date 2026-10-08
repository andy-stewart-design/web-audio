import { describe, expect, it } from "vitest";
import { COMPARISON_TOLERANCE } from "../audio";
import { compareAudio, formatComparison } from "../compare";

const audio = (channels: readonly Float32Array[], sampleRate = 48_000) => ({
  sampleRate,
  channels,
});
const mono = (...samples: number[]) => audio([Float32Array.from(samples)]);

describe("raw audio comparison", () => {
  it("accepts identical audio, above-one peaks and silent sibling channels without changing samples", () => {
    const reference = audio([Float32Array.of(-2, 2, -0), new Float32Array(3)]);
    const current = audio(reference.channels.map((channel) => channel.slice()));
    const before = current.channels.map((channel) =>
      Buffer.from(channel.buffer).toString("hex"),
    );
    const result = compareAudio(reference, current);
    expect(result.passed).toBe(true);
    expect(result.worst).toBeNull();
    expect(
      result.channels.every(
        ({ maxError, rmsError }) => maxError === 0 && rmsError === 0,
      ),
    ).toBe(true);
    expect(
      current.channels.map((channel) =>
        Buffer.from(channel.buffer).toString("hex"),
      ),
    ).toEqual(before);
  });

  it.each([
    ["gain", mono(1, -1), mono(0.5, -0.5)],
    ["timing", mono(1, 0), mono(0, 1)],
    ["polarity", mono(1, -1), mono(-1, 1)],
    [
      "channel order",
      audio([Float32Array.of(1, 0), Float32Array.of(0, 0.5)]),
      audio([Float32Array.of(0, 0.5), Float32Array.of(1, 0)]),
    ],
  ])(
    "rejects %s changes without preprocessing",
    (_name, reference, current) => {
      expect(compareAudio(reference, current).passed).toBe(false);
    },
  );

  it("reports per-channel max/RMS and the first worst channel/frame/time", () => {
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
    expect(formatComparison(result)).toContain("frame 2");
    const tied = compareAudio(
      audio([Float32Array.of(1, 1), Float32Array.of(1, 1)]),
      audio([Float32Array.of(1.5, 1.5), Float32Array.of(1.5, 1.5)]),
    );
    expect(tied.worst).toMatchObject({ channel: 0, frame: 0 });
  });

  it.each([
    [{ maxError: 0.25, rmsError: 0.25 }, true, true],
    [{ maxError: 0.24, rmsError: 0.25 }, false, true],
    [{ maxError: 0.25, rmsError: 0.24 }, true, false],
  ])("requires both inclusive gates: %j", (tolerance, maxPassed, rmsPassed) => {
    const result = compareAudio(mono(1, 1), mono(1.25, 1.25), { tolerance });
    expect(result.channels[0]).toMatchObject({ maxPassed, rmsPassed });
    expect(result.passed).toBe(maxPassed && rmsPassed);
  });

  it("keeps fixed roundoff limits and rejects localized and sustained changes independently", () => {
    const reference = new Float32Array(1024).fill(1);
    const sparse = reference.slice();
    sparse[11] += 2 ** -22;
    const before = sparse.slice();
    const roundoff = compareAudio(audio([reference]), audio([sparse]));
    expect(roundoff.passed).toBe(true);
    expect(roundoff.channels[0]).toMatchObject({
      maxError: 2 ** -22,
      rmsError: 2 ** -22 / 32,
    });
    expect(sparse).toEqual(before);
    sparse[11] = 1 + 9 * 2 ** -23;
    const localized = compareAudio(audio([reference]), audio([sparse]));
    expect(localized.passed).toBe(false);
    expect(localized.channels[0]).toMatchObject({
      maxPassed: false,
      rmsPassed: true,
    });
    const sustained = compareAudio(
      audio([reference]),
      audio([new Float32Array(1024).fill(1 + 2 ** -23)]),
    );
    expect(sustained.passed).toBe(false);
    expect(sustained.channels[0]).toMatchObject({
      maxPassed: true,
      rmsPassed: false,
    });
    expect(COMPARISON_TOLERANCE).toEqual({ maxError: 1e-6, rmsError: 1e-7 });
    expect(Object.isFrozen(COMPARISON_TOLERANCE)).toBe(true);
    expect(
      compareAudio(mono(1), mono(1 + 2 ** -23), {
        tolerance: { maxError: 0, rmsError: 0 },
      }).passed,
    ).toBe(false);
  });

  it.each([
    { maxError: -1, rmsError: 0 },
    { maxError: 0, rmsError: -1 },
    { maxError: Infinity, rmsError: 0 },
    { maxError: 0, rmsError: NaN },
  ])("rejects invalid tolerances %j", (tolerance) => {
    expect(() => compareAudio(mono(1), mono(1), { tolerance })).toThrow();
  });

  it.each([
    [
      "sample rate",
      mono(1),
      audio([Float32Array.of(1)], 44_100),
      /Sample rate mismatch/,
    ],
    [
      "channel count",
      mono(1),
      audio([Float32Array.of(1), Float32Array.of(1)]),
      /Channel count mismatch/,
    ],
    ["frame count", mono(1), mono(1, 2), /Frame count mismatch/],
    [
      "invalid rate",
      audio([Float32Array.of(1)], 0),
      mono(1),
      /Reference sample rate/,
    ],
  ])("rejects %s mismatches", (_label, reference, current, message) => {
    expect(() => compareAudio(reference, current)).toThrow(message);
  });

  // inspectAudio owns the exhaustive health matrix; here protect delegation
  // and reference/current labels so callers can identify the invalid recording.
  it.each([
    ["Reference", mono(NaN), mono(1)],
    ["Current", mono(1), mono(NaN)],
  ])("labels invalid %s audio", (label, reference, current) => {
    expect(() => compareAudio(reference, current)).toThrow(
      `${label}: Non-finite sample`,
    );
  });

  it("rejects sparse channel lists rather than skipping missing channels", () => {
    const sparse = new Array<Float32Array>(2);
    sparse[0] = Float32Array.of(1);
    const complete = audio([Float32Array.of(1), Float32Array.of(1)]);
    expect(() => compareAudio(audio(sparse), complete)).toThrow();
    expect(() => compareAudio(complete, audio(sparse))).toThrow();
  });

  it("requires silence opt-in on both sides, regardless of comparison tolerance", () => {
    expect(() => compareAudio(mono(0), mono(0))).toThrow();
    expect(() => compareAudio(mono(1), mono(0))).toThrow();
    expect(
      compareAudio(mono(0, -0), mono(0, 0), { expectSilence: true }).passed,
    ).toBe(true);
    expect(() =>
      compareAudio(mono(0), mono(1e-10), {
        expectSilence: true,
        tolerance: { maxError: 1, rmsError: 1 },
      }),
    ).toThrow();
  });
});
