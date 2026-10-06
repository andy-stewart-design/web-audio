import { compareAudio } from "../../runner/compare";

// Keep the Phase 1 measurement calls small, but exercise the production
// comparator instead of maintaining a second raw-error implementation.
export function measureDifference(
  reference: readonly Float32Array[],
  current: readonly Float32Array[],
) {
  return compareAudio(
    { sampleRate: 48_000, channels: reference },
    { sampleRate: 48_000, channels: current },
  ).channels.map(({ maxError, rmsError }) => ({ maxError, rmsError }));
}
