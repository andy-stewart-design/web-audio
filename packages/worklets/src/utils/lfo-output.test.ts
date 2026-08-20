import { describe, expect, it } from "vitest";
import { computeLfoOutput } from "./lfo-output";

describe("computeLfoOutput", () => {
  it.each([
    { waveform: -1, expected: 400 },
    { waveform: 0, expected: 800 },
    { waveform: 1, expected: 1200 },
  ])(
    "treats default arguments as baseline and bipolar offset at $waveform",
    ({ waveform, expected }) => {
      expect(computeLfoOutput(800, 400, waveform, false)).toBe(expected);
    },
  );

  it.each([
    { waveform: -1, expected: 400 },
    { waveform: 0, expected: 800 },
    { waveform: 1, expected: 1200 },
  ])(
    "treats normalized arguments as minimum and maximum at $waveform",
    ({ waveform, expected }) => {
      expect(computeLfoOutput(400, 1200, waveform, true)).toBe(expected);
    },
  );

  it("supports negative baseline and offset values", () => {
    expect(computeLfoOutput(-100, -50, -1, false)).toBe(-50);
    expect(computeLfoOutput(-100, -50, 1, false)).toBe(-150);
  });

  it("keeps equal normalized bounds constant", () => {
    expect(computeLfoOutput(0.5, 0.5, -1, true)).toBe(0.5);
    expect(computeLfoOutput(0.5, 0.5, 0, true)).toBe(0.5);
    expect(computeLfoOutput(0.5, 0.5, 1, true)).toBe(0.5);
  });

  it("inversion traverses the same normalized range in reverse", () => {
    const forwardAtLowPhase = computeLfoOutput(400, 1200, -0.25, true);
    const invertedAtLowPhase = computeLfoOutput(400, 1200, 0.25, true);
    const forwardAtHighPhase = computeLfoOutput(400, 1200, 0.25, true);
    const invertedAtHighPhase = computeLfoOutput(400, 1200, -0.25, true);

    expect(invertedAtLowPhase).toBe(forwardAtHighPhase);
    expect(invertedAtHighPhase).toBe(forwardAtLowPhase);
  });

  it("uses the supplied waveform value without changing slew semantics", () => {
    expect(computeLfoOutput(0, 1, 0.25, false)).toBe(0.25);
    expect(computeLfoOutput(0, 1, 0.25, true)).toBe(0.625);
  });
});
