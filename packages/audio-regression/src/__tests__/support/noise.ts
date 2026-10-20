export function maxAbs(channel: Float32Array, start = 0, end = channel.length) {
  let peak = 0;
  for (let index = start; index < end; index++)
    peak = Math.max(peak, Math.abs(channel[index] ?? 0));
  return peak;
}

export function rms(channel: Float32Array, start = 0, end = channel.length) {
  let sum = 0;
  const length = Math.max(0, end - start);
  for (let index = start; index < end; index++) {
    const value = channel[index] ?? 0;
    sum += value * value;
  }
  return length === 0 ? 0 : Math.sqrt(sum / length);
}

export function maxDifference(
  left: Float32Array,
  right: Float32Array,
  start = 0,
  end = Math.min(left.length, right.length),
) {
  let difference = 0;
  for (let index = start; index < end; index++)
    difference = Math.max(
      difference,
      Math.abs((left[index] ?? 0) - (right[index] ?? 0)),
    );
  return difference;
}

export function channelDifference(left: Float32Array, right: Float32Array) {
  const length = Math.min(left.length, right.length);
  const result = new Float32Array(length);
  for (let index = 0; index < length; index++)
    result[index] = (left[index] ?? 0) - (right[index] ?? 0);
  return result;
}
