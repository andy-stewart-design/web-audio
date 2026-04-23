import { describe, expect, it } from "vitest";
import { computeEnvelope } from "./compute-envelope";
import type { ResolvedEnvelopeSchema } from "@/types";

const base: ResolvedEnvelopeSchema = {
  min: 0,
  max: 1,
  a: 0.25,
  d: 0.25,
  s: 0.5,
  r: 0.25,
  mode: "bleed",
};

describe("computeEnvelope", () => {
  describe("timing", () => {
    it("derives startTime from endTime minus noteDuration", () => {
      const result = computeEnvelope(base, 2, 5);
      expect(result.startTime).toBe(3);
      expect(result.endTime).toBe(5);
    });

    it("scales attackDur by noteDuration", () => {
      const result = computeEnvelope(base, 2, 5);
      expect(result.attackDur).toBeCloseTo(0.5);
    });

    it("scales decayDur by noteDuration", () => {
      const result = computeEnvelope(base, 2, 5);
      expect(result.decayDur).toBeCloseTo(0.5);
    });

    it("scales releaseDur by noteDuration", () => {
      const result = computeEnvelope(base, 2, 5);
      expect(result.releaseDur).toBeCloseTo(0.5);
    });

    it("clamps attackDur to MIN_RAMP when computed value is too small", () => {
      const result = computeEnvelope({ ...base, a: 0 }, 2, 5);
      expect(result.attackDur).toBe(0.005);
    });

    it("clamps decayDur to MIN_RAMP when computed value is too small", () => {
      const result = computeEnvelope({ ...base, d: 0 }, 2, 5);
      expect(result.decayDur).toBe(0.005);
    });

    it("clamps releaseDur to MIN_RAMP when computed value is too small", () => {
      const result = computeEnvelope({ ...base, r: 0 }, 2, 5);
      expect(result.releaseDur).toBe(0.005);
    });
  });

  describe("amplitude", () => {
    it("passes min through unscaled by default", () => {
      const result = computeEnvelope({ ...base, min: 0.1 }, 2, 5);
      expect(result.min).toBeCloseTo(0.1);
    });

    it("passes max through unscaled by default", () => {
      const result = computeEnvelope({ ...base, max: 0.8 }, 2, 5);
      expect(result.max).toBeCloseTo(0.8);
    });

    it("computes sustain as interpolation between min and max", () => {
      // s=0.5, min=0, max=1 → sustain=0.5
      const result = computeEnvelope(base, 2, 5);
      expect(result.sustain).toBeCloseTo(0.5);
    });

    it("computes sustain correctly with non-zero min", () => {
      // s=0.5, min=0.2, max=1 → sustain = 0.2 + (1 - 0.2) * 0.5 = 0.6
      const result = computeEnvelope({ ...base, min: 0.2, s: 0.5 }, 2, 5);
      expect(result.sustain).toBeCloseTo(0.6);
    });
  });

  describe("scale", () => {
    it("scales min and max by the scale factor", () => {
      const result = computeEnvelope({ ...base, min: 0, max: 1 }, 2, 5, 0.25);
      expect(result.min).toBeCloseTo(0);
      expect(result.max).toBeCloseTo(0.25);
    });

    it("sustain respects scaled min and max", () => {
      // scale=0.25, min=0, max=0.25, s=0.5 → sustain=0.125
      const result = computeEnvelope(base, 2, 5, 0.25);
      expect(result.sustain).toBeCloseTo(0.125);
    });

    it("defaults scale to 1", () => {
      const explicit = computeEnvelope(base, 2, 5, 1);
      const implicit = computeEnvelope(base, 2, 5);
      expect(explicit).toEqual(implicit);
    });
  });
});
