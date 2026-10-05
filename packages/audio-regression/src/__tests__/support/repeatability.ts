// Measurement only: no alignment, trimming, normalization, or conversion.
// Phase 2 will supply the production reference comparator and shape diagnostics.
export function measureDifference(
  reference: readonly Float32Array[],
  current: readonly Float32Array[],
) {
  if (!reference.length || reference.length !== current.length)
    throw new Error("Channel count mismatch");
  return reference.map((channel, index) => {
    const actual = current[index];
    if (!actual || !channel.length || channel.length !== actual.length)
      throw new Error("Frame count mismatch");
    let maxError = 0;
    let squaredError = 0;
    for (let frame = 0; frame < channel.length; frame++) {
      const expectedSample = channel[frame]!;
      const actualSample = actual[frame]!;
      if (!Number.isFinite(expectedSample) || !Number.isFinite(actualSample))
        throw new Error("Non-finite sample");
      const error = actualSample - expectedSample;
      maxError = Math.max(maxError, Math.abs(error));
      squaredError += error * error;
    }
    return { maxError, rmsError: Math.sqrt(squaredError / channel.length) };
  });
}
