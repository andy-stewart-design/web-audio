import { describe, expect, it } from "vitest";
import { MAX_RATIONAL_DENOMINATOR } from "../../limits";
import {
  addRational,
  compareRational,
  createRational,
  divideRational,
  leastCommonMultiple,
  multiplyRational,
  parseRational,
  rationalToGridIndex,
  subtractRational,
} from "../rational";

const maximum = Number.MAX_SAFE_INTEGER;

describe("exact rational geometry", () => {
  it.each([
    [6, 8, 3, 4],
    [-6, 8, -3, 4],
    [6, -8, -3, 4],
    [-6, -8, 3, 4],
    [0, -8, 0, 1],
    [MAX_RATIONAL_DENOMINATOR + 1, MAX_RATIONAL_DENOMINATOR + 1, 1, 1],
    [maximum, maximum, 1, 1],
  ])("normalizes %s/%s to %s/%s", (numerator, denominator, n, d) => {
    const ratio = createRational(numerator, denominator);
    expect(ratio).toEqual({ numerator: n, denominator: d });
    expect(Object.isFrozen(ratio)).toBe(true);
    expect(Reflect.set(ratio, "numerator", 10)).toBe(false);
  });

  it.each([NaN, Infinity, -Infinity, 0.5, maximum + 1, -maximum - 1])(
    "rejects inexact or unsafe components: %s",
    (value) => {
      expect(() => createRational(value)).toThrow("safe integers");
      expect(() => createRational(1, value)).toThrow("safe integers");
    },
  );

  it("parses finite decimal amounts into exact bounded rationals", () => {
    expect(parseRational("02.00")).toEqual(createRational(2));
    expect(parseRational("1.25")).toEqual(createRational(5, 4));
    expect(parseRational(".5")).toEqual(createRational(1, 2));
    expect(parseRational("+2e-1")).toEqual(createRational(1, 5));
    expect(() => parseRational("-1")).toThrow("finite decimal amount");
    expect(() => parseRational("1e-5")).toThrow("Rational denominator exceeds");
    expect(() => parseRational("1e20")).toThrow("safe integer precision");
  });

  it("rejects zero denominators and division by zero", () => {
    expect(() => createRational(1, 0)).toThrow("denominator cannot be zero");
    expect(() => divideRational(createRational(1), createRational(0))).toThrow(
      "divide a rational by zero",
    );
  });

  it("adds, subtracts, multiplies, and divides without rounding", () => {
    const a = createRational(1, 3);
    const b = createRational(1, 6);
    expect(addRational(a, b)).toEqual(createRational(1, 2));
    expect(subtractRational(b, a)).toEqual(createRational(-1, 6));
    expect(multiplyRational(a, b)).toEqual(createRational(1, 18));
    expect(divideRational(a, b)).toEqual(createRational(2));
    expect(divideRational(a, createRational(-2))).toEqual(
      createRational(-1, 6),
    );
    expect(
      addRational(createRational(4095, 4096), createRational(1, 4096)),
    ).toEqual(createRational(1));
    expect(a).toEqual({ numerator: 1, denominator: 3 });
    expect(b).toEqual({ numerator: 1, denominator: 6 });
  });

  it("reduces exact BigInt intermediates before checking overflow", () => {
    const a = createRational(maximum, 2);
    expect(addRational(a, a)).toEqual(createRational(maximum));
    expect(subtractRational(a, a)).toEqual(createRational(0));
    expect(multiplyRational(a, createRational(2))).toEqual(
      createRational(maximum),
    );
    expect(divideRational(a, a)).toEqual(createRational(1));
  });

  it("rejects unsafe reduced results", () => {
    expect(() =>
      addRational(createRational(maximum), createRational(1)),
    ).toThrow("safe integer precision");
    expect(() =>
      subtractRational(createRational(-maximum), createRational(1)),
    ).toThrow("safe integer precision");
    expect(() =>
      multiplyRational(createRational(maximum), createRational(2)),
    ).toThrow("safe integer precision");
    expect(() =>
      divideRational(createRational(maximum), createRational(1, 2)),
    ).toThrow("safe integer precision");
  });

  it("bounds reduced denominators, including arithmetic results", () => {
    expect(createRational(1, MAX_RATIONAL_DENOMINATOR).denominator).toBe(
      MAX_RATIONAL_DENOMINATOR,
    );
    expect(() => createRational(1, MAX_RATIONAL_DENOMINATOR + 1)).toThrow(
      "Rational denominator exceeds",
    );
    const a = createRational(1, 128);
    const b = createRational(1, 129);
    expect(() => addRational(a, b)).toThrow("Rational denominator exceeds");
    expect(() => subtractRational(a, b)).toThrow(
      "Rational denominator exceeds",
    );
    expect(() => multiplyRational(a, b)).toThrow(
      "Rational denominator exceeds",
    );
  });

  it("compares exact cross-products without unsafe number multiplication", () => {
    expect(compareRational(createRational(1, 3), createRational(2, 6))).toBe(0);
    expect(compareRational(createRational(-1, 3), createRational(0))).toBe(-1);
    expect(
      compareRational(
        createRational(maximum, 2),
        createRational(maximum - 1, 2),
      ),
    ).toBe(1);
  });
});

describe("bounded grid arithmetic", () => {
  it("computes minimal common lengths with a bound", () => {
    expect(leastCommonMultiple(6, 8)).toBe(24);
    expect(leastCommonMultiple(128, 127)).toBe(16256);
    expect(leastCommonMultiple(MAX_RATIONAL_DENOMINATOR, 1)).toBe(
      MAX_RATIONAL_DENOMINATOR,
    );
    expect(() => leastCommonMultiple(128, 129)).toThrow("Grid exceeds");
    expect(() => leastCommonMultiple(6, 8, 23)).toThrow("23 steps");
  });

  it("does not overflow or falsely reject a safely reducible common length", () => {
    expect(leastCommonMultiple(maximum, maximum, maximum)).toBe(maximum);
    expect(() => leastCommonMultiple(maximum, maximum - 1, maximum)).toThrow(
      "Grid exceeds",
    );
  });

  it.each([0, -1, 0.5, NaN, Infinity, maximum + 1])(
    "rejects invalid grid integers: %s",
    (value) => {
      expect(() => leastCommonMultiple(value, 1)).toThrow(
        "positive safe integers",
      );
      expect(() => leastCommonMultiple(1, value)).toThrow(
        "positive safe integers",
      );
      expect(() => leastCommonMultiple(1, 1, value)).toThrow(
        "positive safe integers",
      );
      expect(() => rationalToGridIndex(createRational(0), value)).toThrow(
        "positive safe integer",
      );
    },
  );

  it("maps only exact positions to integer step indexes", () => {
    expect(rationalToGridIndex(createRational(1, 3), 6)).toBe(2);
    expect(rationalToGridIndex(createRational(3, 5), 10)).toBe(6);
    expect(rationalToGridIndex(createRational(1), 6)).toBe(6);
    expect(() => rationalToGridIndex(createRational(1, 3), 2)).toThrow(
      "does not align",
    );
  });
});
