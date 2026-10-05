import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  normalizeCase,
  parseCaseSelector,
  planRender,
  selectCase,
} from "../cases";
import { sketch } from "./support/cases";

describe("case registry and render settings", () => {
  it("applies explicit defaults without mutating the input", () => {
    const input = sketch({ settings: { channels: 1 } });
    expect(normalizeCase(input).settings).toEqual({
      ...DEFAULT_SETTINGS,
      channels: 1,
    });
    expect(input.settings).toEqual({ channels: 1 });
    expect(normalizeCase(input).expectSilence).toBe(false);
  });

  it.each([
    [{ id: "../bad" }, /ID/],
    [{ description: "" }, /description/],
    [{ bars: 0 }, /bars/],
    [{ bars: 1.5 }, /bars/],
    [{ tailSeconds: -1 }, /tailSeconds/],
    [{ tailSeconds: Infinity }, /tailSeconds/],
    [{ settings: { sampleRate: 1 } }, /sampleRate/],
    [{ settings: { sampleRate: NaN } }, /sampleRate/],
    [{ settings: { sampleRate: 384_001 } }, /sampleRate/],
    [{ settings: { channels: 0 } }, /channels/],
    [{ settings: { channels: 33 } }, /channels/],
    [{ settings: { beatsPerBar: 0 } }, /beatsPerBar/],
    [{ settings: { startOffsetFrames: -1 } }, /startOffsetFrames/],
    [{ settings: { startOffsetFrames: 0.5 } }, /startOffsetFrames/],
  ])("rejects invalid input %j", (overrides, message) => {
    expect(() => normalizeCase(sketch(overrides))).toThrow(message);
  });

  it("rejects empty registries, duplicates, and unknown selectors", () => {
    expect(() => selectCase([], "sine")).toThrow(/empty/);
    expect(() => selectCase([sketch(), sketch()], "sine")).toThrow(/Duplicate/);
    expect(() => selectCase([sketch()], "missing")).toThrow(/Unknown/);
    expect(selectCase([sketch()], "sine").id).toBe("sine");
  });

  it("requires one explicit case selector", () => {
    expect(parseCaseSelector(["--case", "sine"])).toBe("sine");
    for (const args of [
      [],
      ["sine"],
      ["--case"],
      ["--case", "sine", "extra"],
      ["--case", ""],
    ]) {
      expect(() => parseCaseSelector(args)).toThrow(/Usage/);
    }
  });

  it("calculates default/schema BPM timing and rounds up complete frames", () => {
    expect(planRender(normalizeCase(sketch()))).toEqual({
      bpm: 120,
      startTime: 0.1,
      barDuration: 2,
      frameCount: 112_800,
      duration: 2.35,
    });
    const result = planRender(
      normalizeCase(sketch({ bars: 2, tailSeconds: 0.125 })),
      90,
    );
    expect(result.barDuration).toBe(8 / 3);
    expect(result.frameCount).toBe(
      Math.ceil((0.1 + 2 * (8 / 3) + 0.125) * 48_000),
    );
    expect(result.duration).toBeGreaterThanOrEqual(0.1 + 2 * (8 / 3) + 0.125);
    expect(() => planRender(normalizeCase(sketch()), 0)).toThrow(/BPM/);
    expect(() => planRender(normalizeCase(sketch()), NaN)).toThrow(/BPM/);
    expect(() =>
      planRender(normalizeCase(sketch({ bars: Number.MAX_SAFE_INTEGER }))),
    ).toThrow(/frame count/);
  });
});
