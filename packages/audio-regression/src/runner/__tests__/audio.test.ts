import { describe, expect, it } from "vitest";
import { inspectAudio } from "../audio";

describe("rendered signal health", () => {
  it("calculates channel metrics and preserves finite values above one", () => {
    const data = Float32Array.of(-2, 2);
    expect(inspectAudio([data])).toEqual([{ peak: 2, rms: 2 }]);
    expect(Array.from(data)).toEqual([-2, 2]);
  });

  it("requires explicit silence and rejects nonzero silent cases", () => {
    const silent = new Float32Array(4);
    expect(() => inspectAudio([silent])).toThrow(/Expected audible/);
    expect(inspectAudio([silent], true)).toEqual([{ peak: 0, rms: 0 }]);
    expect(() => inspectAudio([Float32Array.of(0.1)], true)).toThrow(
      /Expected silence/,
    );
    expect(() => inspectAudio([Float32Array.of(1e-10)])).toThrow(/negligible/);
  });

  it("rejects empty/mismatched channels and non-finite samples", () => {
    expect(() => inspectAudio([])).toThrow(/empty/);
    expect(() => inspectAudio([new Float32Array()])).toThrow(/empty/);
    expect(() =>
      inspectAudio([Float32Array.of(1), Float32Array.of(1, 2)]),
    ).toThrow(/lengths differ/);
    expect(() => inspectAudio([Float32Array.of(NaN)])).toThrow(
      /channel 0 at frame 0/,
    );
    expect(() => inspectAudio([Float32Array.of(Infinity)])).toThrow(
      /Non-finite/,
    );
  });
});
