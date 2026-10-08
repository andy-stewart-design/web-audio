import type { SketchCase } from "../../types";
import { encodeWav } from "../../runner/wav";

// Tooling fixtures are independent of the user's authored cases and references.
export function sketch(overrides: Partial<SketchCase> = {}) {
  const input: SketchCase = {
    id: "sine",
    description: "Temporary tooling fixture, not an approved reference",
    code: "d.synth('sine').notes(69).gain(0.5).push();",
    bars: 1,
    tailSeconds: 0.25,
  };
  return { ...input, ...overrides };
}

// A short procedural input for native decoding; no committed asset is regenerated.
export const sampleWav = encodeWav({
  sampleRate: 48_000,
  channels: [
    Float32Array.from(
      { length: 4_800 },
      (_, frame) => 0.25 * Math.sin((2 * Math.PI * 440 * frame) / 48_000),
    ),
  ],
});
