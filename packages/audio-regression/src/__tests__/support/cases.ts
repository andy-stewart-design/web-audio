import { selectCase } from "../../cases";
import { loadCases } from "../../runner/load-cases";
import type { SketchCase } from "../../types";

export const cases = await loadCases();

export function sketch(overrides: Partial<SketchCase> = {}) {
  return { ...selectCase(cases, "sine"), ...overrides };
}

export function estimateFrequency(
  channel: Float32Array,
  from: number,
  to: number,
  sampleRate: number,
) {
  const crossings: number[] = [];
  for (let frame = from + 1; frame < to; frame++) {
    if (channel[frame - 1]! <= 0 && channel[frame]! > 0) crossings.push(frame);
  }
  const first = crossings[0];
  const last = crossings.at(-1);
  if (first === undefined || last === undefined || first === last)
    throw new Error("Insufficient zero crossings");
  return ((crossings.length - 1) * sampleRate) / (last - first);
}

export function windowPeak(
  channel: Float32Array,
  startTime: number,
  duration: number,
  sampleRate: number,
) {
  const from = Math.floor(startTime * sampleRate);
  const to = Math.min(
    channel.length,
    Math.ceil((startTime + duration) * sampleRate),
  );
  let peak = 0;
  for (let frame = from; frame < to; frame++)
    peak = Math.max(peak, Math.abs(channel[frame]!));
  return peak;
}
