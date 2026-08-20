function computeLfoOutput(
  outputA: number,
  outputB: number,
  waveformValue: number,
  normalized: boolean,
) {
  if (!normalized) return outputA + outputB * waveformValue;

  const unipolarValue = (waveformValue + 1) * 0.5;
  return outputA + (outputB - outputA) * unipolarValue;
}

export { computeLfoOutput };
