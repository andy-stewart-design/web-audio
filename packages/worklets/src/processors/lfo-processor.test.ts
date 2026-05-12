import { describe, expect, it } from "vitest";
import { lfoProcessorSource } from "../index";

describe("lfoProcessorSource", () => {
  it("is a non-empty string", () => {
    expect(typeof lfoProcessorSource).toBe("string");
    expect(lfoProcessorSource.length).toBeGreaterThan(0);
  });

  it("registers the lfo-processor", () => {
    expect(lfoProcessorSource).toContain("lfo-processor");
  });

  it("defines the LfoProcessor class", () => {
    expect(lfoProcessorSource).toContain("LfoProcessor");
  });
});
