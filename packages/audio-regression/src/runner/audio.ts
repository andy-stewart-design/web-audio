// Reviewed native Float32 mixing variation: max up to ~3.58e-7, RMS ~1.28e-8.
// Fixed suite-wide gates with a small margin; never adapt them to failed comparisons.
// Evidence and trade-offs: plans/audio-regression-testing/repeatability.md.
export const COMPARISON_TOLERANCE = Object.freeze({
  maxError: 1e-6,
  rmsError: 1e-7,
});

// Signal health only, not reference comparison or a musical quality assertion.
export function inspectAudio(
  channels: readonly Float32Array[],
  expectSilence = false,
) {
  if (channels.length === 0 || !channels[0]?.length)
    throw new Error("Rendered audio is empty");
  const frameCount = channels[0].length;
  const metrics = channels.map((channel, channelIndex) => {
    if (channel.length !== frameCount)
      throw new Error("Rendered channel lengths differ");
    let peak = 0;
    let energy = 0;
    for (let frame = 0; frame < channel.length; frame++) {
      const sample = channel[frame]!;
      if (!Number.isFinite(sample))
        throw new Error(
          `Non-finite sample in channel ${channelIndex} at frame ${frame}`,
        );
      peak = Math.max(peak, Math.abs(sample));
      energy += sample * sample;
    }
    return { peak, rms: Math.sqrt(energy / channel.length) };
  });
  if (expectSilence) {
    if (metrics.some(({ peak }) => peak !== 0))
      throw new Error("Expected silence but rendered audio is non-zero");
  } else if (!metrics.some(({ rms }) => rms > 1e-8)) {
    throw new Error(
      "Expected audible output but rendered audio is silent or negligible",
    );
  }
  return metrics;
}
