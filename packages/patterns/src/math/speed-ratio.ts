// Fluent speed inputs resolve within this tolerance using a denominator at
// most 64. This compatibility boundary is separate from exact event geometry.
const MAX_SPEED_DENOMINATOR = 64;
const SPEED_TOLERANCE = 1e-8;

function getSpeedRatio(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(
      "[Pattern] Speed multipliers must be positive finite numbers.",
    );
  }

  let closest: { numerator: number; denominator: number } | undefined;
  let closestError = Number.POSITIVE_INFINITY;

  for (
    let denominator = 1;
    denominator <= MAX_SPEED_DENOMINATOR;
    denominator++
  ) {
    const numerator = Math.round(value * denominator);
    if (!Number.isSafeInteger(numerator) || numerator <= 0) continue;

    const error = Math.abs(value - numerator / denominator);
    if (error >= closestError) continue;
    closest = { numerator, denominator };
    closestError = error;
  }

  if (!closest || closestError > SPEED_TOLERANCE) {
    throw new Error(
      `[Pattern] Speed multiplier ${value} must be representable with a denominator no greater than ${MAX_SPEED_DENOMINATOR}.`,
    );
  }

  const divisor = greatestCommonDivisor(closest.numerator, closest.denominator);
  return {
    numerator: closest.numerator / divisor,
    denominator: closest.denominator / divisor,
  };
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

export { getSpeedRatio, greatestCommonDivisor };
