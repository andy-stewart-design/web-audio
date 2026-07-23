import { describe, expect, test } from "vitest";
import { midiToFrequency } from "./midi-to-frequency";

describe("midiToFrequency", () => {
  test("converts the valid MIDI endpoint note 0", () => {
    expect(midiToFrequency(0)).toBeCloseTo(8.1758, 4);
  });

  test("retains the upper MIDI endpoint and rejects values outside the range", () => {
    expect(midiToFrequency(127)).toBeGreaterThan(0);
    expect(midiToFrequency(-1)).toBe(0);
    expect(midiToFrequency(128)).toBe(0);
  });
});
