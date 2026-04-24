import { describe, expect, it } from "vitest";
import { isEnvelope, isRandom, isStatic } from "./index";
import type { EnvelopeSchema, RandomSchema, StaticSchema } from "./index";

const staticSchema: StaticSchema = {
  type: "static",
  polyphonic: false,
  cycle: [[{ value: 60, offset: 0, duration: 1, stepIndex: 0 }]],
};

const randomSchema: RandomSchema = {
  type: "random",
  dataType: "float",
  segments: [{ seed: 42 }],
  quantValue: undefined,
  range: undefined,
  algorithm: "xor",
  cycle: staticSchema,
};

const envelopeSchema: EnvelopeSchema = {
  type: "envelope",
  min: 0,
  max: staticSchema,
  a: staticSchema,
  d: staticSchema,
  s: staticSchema,
  r: staticSchema,
  mode: "bleed",
};

describe("isEnvelope", () => {
  it("returns true for an EnvelopeSchema", () => {
    expect(isEnvelope(envelopeSchema)).toBe(true);
  });

  it("returns false for a StaticSchema", () => {
    expect(isEnvelope(staticSchema)).toBe(false);
  });

  it("returns false for a RandomSchema", () => {
    expect(isEnvelope(randomSchema)).toBe(false);
  });
});

describe("isStatic", () => {
  it("returns true for a StaticSchema", () => {
    expect(isStatic(staticSchema)).toBe(true);
  });

  it("returns false for a RandomSchema", () => {
    expect(isStatic(randomSchema)).toBe(false);
  });
});

describe("isRandom", () => {
  it("returns true for a RandomSchema", () => {
    expect(isRandom(randomSchema)).toBe(true);
  });

  it("returns false for a StaticSchema", () => {
    expect(isRandom(staticSchema)).toBe(false);
  });
});
