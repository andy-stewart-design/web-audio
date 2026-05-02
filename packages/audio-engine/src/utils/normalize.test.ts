import { describe, expect, it } from "vitest";
import { normalizeADSR } from "./normalize";

describe("normalizeADSR", () => {
  describe("bleed mode", () => {
    it("passes through A and D unchanged when their sum is already <= 1", () => {
      const result = normalizeADSR({
        a: 0.3,
        d: 0.2,
        s: 0.8,
        r: 0.5,
        min: 0,
        max: 1,
        mode: "bleed",
      });
      expect(result.a).toBe(0.3);
      expect(result.d).toBe(0.2);
    });

    it("scales A and D proportionally when their sum exceeds 1", () => {
      const result = normalizeADSR({
        a: 0.6,
        d: 0.6,
        s: 0.8,
        r: 0.5,
        min: 0,
        max: 1,
        mode: "bleed",
      });
      expect(result.a).toBeCloseTo(0.5);
      expect(result.d).toBeCloseTo(0.5);
    });

    it("preserves the A:D ratio when scaling", () => {
      const result = normalizeADSR({
        a: 0.8,
        d: 0.4,
        s: 0.8,
        r: 0.5,
        min: 0,
        max: 1,
        mode: "bleed",
      });
      expect(result.a / result.d).toBeCloseTo(2);
      expect(result.a + result.d).toBeCloseTo(1);
    });

    it("passes R through unchanged when it is <= 1", () => {
      const result = normalizeADSR({
        a: 0.3,
        d: 0.2,
        s: 0.8,
        r: 0.5,
        min: 0,
        max: 1,
        mode: "bleed",
      });
      expect(result.r).toBe(0.5);
    });

    it("caps R at 1 when it exceeds 1", () => {
      const result = normalizeADSR({
        a: 0.3,
        d: 0.2,
        s: 0.8,
        r: 1.5,
        min: 0,
        max: 1,
        mode: "bleed",
      });
      expect(result.r).toBe(1);
    });

    it("does not scale R even when A+D > 1", () => {
      const result = normalizeADSR({
        a: 0.6,
        d: 0.6,
        s: 0.8,
        r: 0.5,
        min: 0,
        max: 1,
        mode: "bleed",
      });
      expect(result.r).toBe(0.5);
    });

    it("passes S through unchanged", () => {
      const result = normalizeADSR({
        a: 0.6,
        d: 0.6,
        s: 0.8,
        r: 0.5,
        min: 0,
        max: 1,
        mode: "bleed",
      });
      expect(result.s).toBe(0.8);
    });
  });

  describe("clip mode", () => {
    it("passes through A, D, and R unchanged when their sum is already <= 1", () => {
      const result = normalizeADSR({
        a: 0.2,
        d: 0.1,
        s: 0.8,
        r: 0.1,
        min: 0,
        max: 1,
        mode: "clip",
      });
      expect(result.a).toBe(0.2);
      expect(result.d).toBe(0.1);
      expect(result.r).toBe(0.1);
    });

    it("scales A, D, and R proportionally when their sum exceeds 1", () => {
      const result = normalizeADSR({
        a: 0.5,
        d: 0.3,
        s: 0.8,
        r: 0.4,
        min: 0,
        max: 1,
        mode: "clip",
      });
      expect(result.a + result.d + result.r).toBeCloseTo(1);
    });

    it("preserves the A:D:R ratio when scaling", () => {
      const result = normalizeADSR({
        a: 0.5,
        d: 0.3,
        s: 0.8,
        r: 0.4,
        min: 0,
        max: 1,
        mode: "clip",
      });
      expect(result.a / result.r).toBeCloseTo(0.5 / 0.4);
      expect(result.a / result.d).toBeCloseTo(0.5 / 0.3);
    });

    it("passes S through unchanged", () => {
      const result = normalizeADSR({
        a: 0.5,
        d: 0.3,
        s: 0.8,
        r: 0.4,
        min: 0,
        max: 1,
        mode: "clip",
      });
      expect(result.s).toBe(0.8);
    });
  });

  describe("edge cases", () => {
    it("handles all zeros without dividing by zero", () => {
      const result = normalizeADSR({
        a: 0,
        d: 0,
        s: 0,
        r: 0,
        min: 0,
        max: 1,
        mode: "bleed",
      });
      expect(result.a).toBe(0);
      expect(result.d).toBe(0);
      expect(result.s).toBe(0);
      expect(result.r).toBe(0);
    });

    it("handles all zeros in clip mode without dividing by zero", () => {
      const result = normalizeADSR({
        a: 0,
        d: 0,
        s: 0,
        r: 0,
        min: 0,
        max: 1,
        mode: "clip",
      });
      expect(result.a).toBe(0);
      expect(result.d).toBe(0);
      expect(result.r).toBe(0);
    });

    it("handles a single dominant value in bleed mode", () => {
      const result = normalizeADSR({
        a: 2,
        d: 0,
        s: 0.8,
        r: 0.1,
        min: 0,
        max: 1,
        mode: "bleed",
      });
      expect(result.a).toBeCloseTo(1);
      expect(result.d).toBeCloseTo(0);
    });

    it("handles a single dominant value in clip mode", () => {
      const result = normalizeADSR({
        a: 3,
        d: 0,
        s: 0.8,
        r: 0,
        min: 0,
        max: 1,
        mode: "clip",
      });
      expect(result.a).toBeCloseTo(1);
      expect(result.d).toBeCloseTo(0);
      expect(result.r).toBeCloseTo(0);
    });
  });
});
