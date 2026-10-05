// Signal health only, not reference comparison or a musical quality assertion.
export function inspectAudio(channels: Float32Array[], expectSilence = false) {
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
