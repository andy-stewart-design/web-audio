import { COMPARISON_TOLERANCE, inspectAudio } from "./audio";

// Accept decoded WAVs or native render channels; metadata/provenance is not an
// equality gate. Never align, trim, resample, normalize, clip or mutate samples.
export function compareAudio(
  reference: { sampleRate: number; channels: readonly Float32Array[] },
  current: typeof reference,
  options: {
    expectSilence?: boolean;
    tolerance?: { maxError: number; rmsError: number };
  } = {},
) {
  const tolerance = { ...(options.tolerance ?? COMPARISON_TOLERANCE) };
  for (const metric of ["maxError", "rmsError"] as const) {
    const value = tolerance[metric];
    if (!Number.isFinite(value) || value < 0)
      throw new Error(
        `Comparison ${metric} tolerance must be finite and non-negative`,
      );
  }
  for (const [label, audio] of [
    ["Reference", reference],
    ["Current", current],
  ] as const) {
    if (!Number.isInteger(audio.sampleRate) || audio.sampleRate <= 0)
      throw new Error(`${label} sample rate must be a positive integer`);
  }
  if (reference.sampleRate !== current.sampleRate)
    throw new Error(
      `Sample rate mismatch: reference ${reference.sampleRate} Hz, current ${current.sampleRate} Hz`,
    );
  if (reference.channels.length !== current.channels.length)
    throw new Error(
      `Channel count mismatch: reference ${reference.channels.length}, current ${current.channels.length}`,
    );
  const frameCount = reference.channels[0]?.length ?? 0;
  const currentFrames = current.channels[0]?.length ?? 0;
  if (frameCount !== currentFrames)
    throw new Error(
      `Frame count mismatch: reference ${frameCount}, current ${currentFrames}`,
    );
  const health = (label: string, channels: readonly Float32Array[]) => {
    try {
      for (const channel of channels) {
        if (!(channel instanceof Float32Array))
          throw new Error("Audio channels must be Float32Arrays");
      }
      return inspectAudio(channels, options.expectSilence ?? false);
    } catch (error) {
      throw new Error(
        `${label}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  };
  const referenceMetrics = health("Reference", reference.channels);
  const currentMetrics = health("Current", current.channels);
  const channels = reference.channels.map((expected, channel) => {
    const actual = current.channels[channel]!;
    let maxError = 0;
    let squaredError = 0;
    let worstFrame = 0;
    for (let frame = 0; frame < frameCount; frame++) {
      const error = actual[frame]! - expected[frame]!;
      const magnitude = Math.abs(error);
      squaredError += error * error;
      if (magnitude > maxError) {
        maxError = magnitude;
        worstFrame = frame;
      }
    }
    const rmsError = Math.sqrt(squaredError / frameCount);
    const maxPassed = maxError <= tolerance.maxError;
    const rmsPassed = rmsError <= tolerance.rmsError;
    return {
      channel,
      maxError,
      rmsError,
      maxPassed,
      rmsPassed,
      passed: maxPassed && rmsPassed,
      worst:
        maxError === 0
          ? null
          : {
              channel,
              frame: worstFrame,
              time: worstFrame / reference.sampleRate,
              error: maxError,
              referenceValue: expected[worstFrame]!,
              currentValue: actual[worstFrame]!,
            },
    };
  });
  const worst = channels.reduce<(typeof channels)[number]["worst"]>(
    (largest, channel) =>
      channel.worst && (!largest || channel.worst.error > largest.error)
        ? channel.worst
        : largest,
    null,
  );
  return {
    passed: channels.every((channel) => channel.passed),
    sampleRate: reference.sampleRate,
    frameCount,
    tolerance,
    referenceMetrics,
    currentMetrics,
    channels,
    worst,
  };
}

export function formatComparison(result: ReturnType<typeof compareAudio>) {
  const lines = [
    `Audio comparison ${result.passed ? "passed" : "FAILED"}: ${result.sampleRate} Hz, ${result.channels.length} channels, ${result.frameCount} frames`,
    `Thresholds: max <= ${result.tolerance.maxError}, RMS <= ${result.tolerance.rmsError}`,
    ...result.channels.map(
      (channel) =>
        `Channel ${channel.channel}: max=${channel.maxError.toExponential(6)} (${channel.maxPassed ? "pass" : "FAIL"}), RMS=${channel.rmsError.toExponential(6)} (${channel.rmsPassed ? "pass" : "FAIL"})`,
    ),
  ];
  if (result.worst) {
    const { channel, frame, time, error, referenceValue, currentValue } =
      result.worst;
    lines.push(
      `Worst error: channel ${channel}, frame ${frame}, time ${time.toFixed(9)} s, abs=${error.toExponential(6)}, reference=${referenceValue}, current=${currentValue}`,
    );
  } else lines.push("No sample differences.");
  return lines.join("\n");
}
