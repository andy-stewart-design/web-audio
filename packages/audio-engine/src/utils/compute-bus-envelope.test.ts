import { describe, expect, it } from "vitest";
import { computeBusEnvelope } from "./compute-bus-envelope";

function envelope(a: number, d: number, r: number) {
  return { min: 0, max: 1, a, d, s: 0.5, r, mode: "bleed" as const };
}

describe("computeBusEnvelope", () => {
  it("places attack, decay, sustain, and release inside one bar", () => {
    expect(computeBusEnvelope(envelope(0.25, 0.25, 0.25), 10, 2)).toEqual({
      min: 0,
      max: 1,
      sustain: 0.5,
      startTime: 10,
      attackEnd: 10.5,
      decayEnd: 11,
      releaseStart: 11.5,
      endTime: 12,
    });
  });

  it("normalizes oversubscribed ADR proportions to one bar", () => {
    const result = computeBusEnvelope(envelope(1, 1, 2), 0, 4);

    expect(result.attackEnd).toBeCloseTo(1);
    expect(result.decayEnd).toBeCloseTo(2);
    expect(result.releaseStart).toBeCloseTo(2);
    expect(result.endTime).toBe(4);
  });

  it("applies minimum ramps without scheduling out of order", () => {
    const result = computeBusEnvelope(envelope(0, 0, 0), 1, 2);

    expect(result.attackEnd).toBe(1.0025);
    expect(result.decayEnd).toBe(1.005);
    expect(result.releaseStart).toBe(2.9975);
    expect(result.endTime).toBe(3);
  });

  it("divides bars too short for minimum ramps without crossing the boundary", () => {
    const result = computeBusEnvelope(envelope(0, 0, 0), 2, 0.003);

    expect(result.attackEnd).toBeCloseTo(2.001);
    expect(result.decayEnd).toBeCloseTo(2.002);
    expect(result.releaseStart).toBeCloseTo(2.002);
    expect(result.endTime).toBeCloseTo(2.003);
  });
});
