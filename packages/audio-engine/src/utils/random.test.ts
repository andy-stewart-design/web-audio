import { describe, expect, it } from "vitest";
import {
  xorwise,
  getSeed,
  seedToRand,
  floatMapper,
  intMapper,
  binaryMapper,
} from "./random";

describe("xorwise", () => {
  it("is deterministic", () => {
    expect(xorwise(42)).toBe(xorwise(42));
  });

  it("produces different values for different inputs", () => {
    expect(xorwise(1)).not.toBe(xorwise(2));
  });
});

describe("getSeed", () => {
  it("is deterministic", () => {
    expect(getSeed(10)).toBe(getSeed(10));
  });

  it("produces different values for different inputs", () => {
    expect(getSeed(0)).not.toBe(getSeed(1));
  });
});

describe("seedToRand", () => {
  it("produces values in [-1, 1]", () => {
    for (let i = 0; i < 100; i++) {
      const seed = getSeed(i);
      const r = seedToRand(seed);
      expect(r).toBeGreaterThanOrEqual(-1);
      expect(r).toBeLessThanOrEqual(1);
    }
  });
});

describe("floatMapper", () => {
  it("maps 0 to start and 1 to end", () => {
    expect(floatMapper(0, 100, 200)).toBe(100);
    expect(floatMapper(1, 100, 200)).toBe(200);
  });

  it("maps 0.5 to midpoint", () => {
    expect(floatMapper(0.5, 0, 10)).toBe(5);
  });
});

describe("intMapper", () => {
  it("floors the result", () => {
    expect(intMapper(0.99, 0, 10)).toBe(9);
    expect(intMapper(0, 0, 10)).toBe(0);
  });
});

describe("binaryMapper", () => {
  it("rounds to 0 or 1", () => {
    expect(binaryMapper(0.3, 0, 1)).toBe(0);
    expect(binaryMapper(0.7, 0, 1)).toBe(1);
    expect(binaryMapper(0.5, 0, 1)).toBe(1);
  });
});
