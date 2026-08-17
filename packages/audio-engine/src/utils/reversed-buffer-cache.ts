function getReversedBuffer(
  ctx: AudioContext,
  cache: WeakMap<AudioBuffer, AudioBuffer>,
  original: AudioBuffer,
) {
  const cached = cache.get(original);
  if (cached) return cached;

  const reversed = ctx.createBuffer(
    original.numberOfChannels,
    original.length,
    original.sampleRate,
  );

  for (let channel = 0; channel < original.numberOfChannels; channel++) {
    reversed
      .getChannelData(channel)
      .set(original.getChannelData(channel).slice().reverse());
  }

  cache.set(original, reversed);
  return reversed;
}

export { getReversedBuffer };
