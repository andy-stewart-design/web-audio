import { describe, expect, it } from "vitest";
import { normalizeADSR } from "./normalize";

describe("normalizeADSR", () => {
  describe("bleed mode", () => {
    it("passes through A and D unchanged when their sum is already <= 1", () => {
      const result = normalizeADSR(0.3, 0.2, 0.8, 0.5, "bleed");
      expect(result.a).toBe(0.3);
      expect(result.d).toBe(0.2);
    });

    it("scales A and D proportionally when their sum exceeds 1", () => {
      const result = normalizeADSR(0.6, 0.6, 0.8, 0.5, "bleed");
      expect(result.a).toBeCloseTo(0.5);
      expect(result.d).toBeCloseTo(0.5);
    });

    it("preserves the A:D ratio when scaling", () => {
      const result = normalizeADSR(0.8, 0.4, 0.8, 0.5, "bleed");
      expect(result.a / result.d).toBeCloseTo(2);
      expect(result.a + result.d).toBeCloseTo(1);
    });

    it("passes R through unchanged when it is <= 1", () => {
      const result = normalizeADSR(0.3, 0.2, 0.8, 0.5, "bleed");
      expect(result.r).toBe(0.5);
    });

    it("caps R at 1 when it exceeds 1", () => {
      const result = normalizeADSR(0.3, 0.2, 0.8, 1.5, "bleed");
      expect(result.r).toBe(1);
    });

    it("does not scale R even when A+D > 1", () => {
      const result = normalizeADSR(0.6, 0.6, 0.8, 0.5, "bleed");
      expect(result.r).toBe(0.5);
    });

    it("passes S through unchanged", () => {
      const result = normalizeADSR(0.6, 0.6, 0.8, 0.5, "bleed");
      expect(result.s).toBe(0.8);
    });
  });

  describe("clip mode", () => {
    it("passes through A, D, and R unchanged when their sum is already <= 1", () => {
      const result = normalizeADSR(0.2, 0.1, 0.8, 0.1, "clip");
      expect(result.a).toBe(0.2);
      expect(result.d).toBe(0.1);
      expect(result.r).toBe(0.1);
    });

    it("scales A, D, and R proportionally when their sum exceeds 1", () => {
      const result = normalizeADSR(0.5, 0.3, 0.8, 0.4, "clip");
      expect(result.a + result.d + result.r).toBeCloseTo(1);
    });

    it("preserves the A:D:R ratio when scaling", () => {
      const result = normalizeADSR(0.5, 0.3, 0.8, 0.4, "clip");
      expect(result.a / result.r).toBeCloseTo(0.5 / 0.4);
      expect(result.a / result.d).toBeCloseTo(0.5 / 0.3);
    });

    it("passes S through unchanged", () => {
      const result = normalizeADSR(0.5, 0.3, 0.8, 0.4, "clip");
      expect(result.s).toBe(0.8);
    });
  });

  describe("edge cases", () => {
    it("handles all zeros without dividing by zero", () => {
      const result = normalizeADSR(0, 0, 0, 0, "bleed");
      expect(result.a).toBe(0);
      expect(result.d).toBe(0);
      expect(result.s).toBe(0);
      expect(result.r).toBe(0);
    });

    it("handles all zeros in clip mode without dividing by zero", () => {
      const result = normalizeADSR(0, 0, 0, 0, "clip");
      expect(result.a).toBe(0);
      expect(result.d).toBe(0);
      expect(result.r).toBe(0);
    });

    it("handles a single dominant value in bleed mode", () => {
      const result = normalizeADSR(2, 0, 0.8, 0.1, "bleed");
      expect(result.a).toBeCloseTo(1);
      expect(result.d).toBeCloseTo(0);
    });

    it("handles a single dominant value in clip mode", () => {
      const result = normalizeADSR(3, 0, 0.8, 0, "clip");
      expect(result.a).toBeCloseTo(1);
      expect(result.d).toBeCloseTo(0);
      expect(result.r).toBeCloseTo(0);
    });
  });
});
