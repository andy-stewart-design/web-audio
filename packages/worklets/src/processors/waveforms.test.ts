import { describe, expect, it } from "vitest";
import { sawtooth, sine, square, triangle } from "./lfo-processor";

describe("sine", () => {
  it("returns 0 at phase 0", () => {
    expect(sine(0)).toBeCloseTo(0);
  });

  it("returns 1 at phase 0.25", () => {
    expect(sine(0.25)).toBeCloseTo(1);
  });

  it("returns 0 at phase 0.5", () => {
    expect(sine(0.5)).toBeCloseTo(0);
  });

  it("returns -1 at phase 0.75", () => {
    expect(sine(0.75)).toBeCloseTo(-1);
  });
});

describe("triangle", () => {
  it("returns 1 at phase 0", () => {
    expect(triangle(0)).toBeCloseTo(1);
  });

  it("returns 0 at phase 0.25", () => {
    expect(triangle(0.25)).toBeCloseTo(0);
  });

  it("returns -1 at phase 0.5", () => {
    expect(triangle(0.5)).toBeCloseTo(-1);
  });

  it("returns 0 at phase 0.75", () => {
    expect(triangle(0.75)).toBeCloseTo(0);
  });
});

describe("sawtooth", () => {
  it("returns 0 at phase 0", () => {
    expect(sawtooth(0)).toBeCloseTo(0);
  });

  it("returns ~1 just before phase 0.5", () => {
    expect(sawtooth(0.499)).toBeCloseTo(1, 1);
  });

  it("returns ~-1 just after phase 0.5", () => {
    expect(sawtooth(0.501)).toBeCloseTo(-1, 1);
  });

  it("returns 0 at phase 1", () => {
    expect(sawtooth(1)).toBeCloseTo(0);
  });
});

describe("square", () => {
  it("returns 1 at phase 0", () => {
    expect(square(0)).toBe(1);
  });

  it("returns 1 at phase 0.25", () => {
    expect(square(0.25)).toBe(1);
  });

  it("returns -1 at phase 0.5", () => {
    expect(square(0.5)).toBe(-1);
  });

  it("returns -1 at phase 0.75", () => {
    expect(square(0.75)).toBe(-1);
  });
});
