import { MAX_RATIONAL_DENOMINATOR } from "../limits";

/** Transient exact geometry; never stored on canonical event steps. */
type Rational = {
  readonly numerator: number;
  readonly denominator: number;
};

function createRational(numerator: number, denominator = 1) {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
    throw new Error("[Pattern] Rational components must be safe integers.");
  }
  return normalizeRational(BigInt(numerator), BigInt(denominator));
}

function parseRational(value: string) {
  const match =
    /^(?:\+)?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(value);
  if (!match) {
    throw new Error(`[Pattern] '${value}' is not a finite decimal amount.`);
  }

  const integer = match[1] ?? "0";
  const fraction = match[2] ?? match[3] ?? "";
  const exponent = Number(match[4] ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 20) {
    throw new Error(`[Pattern] Rational amount '${value}' is too large.`);
  }

  let numerator = BigInt(`${integer}${fraction}`);
  let scale = fraction.length - exponent;
  while (scale > 0 && numerator % 10n === 0n) {
    numerator /= 10n;
    scale--;
  }
  if (scale >= 0) {
    return normalizeRational(numerator, 10n ** BigInt(scale));
  }
  return normalizeRational(numerator * 10n ** BigInt(-scale), 1n);
}

function normalizeRational(numerator: bigint, denominator: bigint) {
  if (denominator === 0n) {
    throw new Error("[Pattern] Rational denominator cannot be zero.");
  }
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const divisor = greatestCommonDivisor(numerator, denominator);
  numerator /= divisor;
  denominator /= divisor;
  const maximum = BigInt(Number.MAX_SAFE_INTEGER);
  if (numerator > maximum || numerator < -maximum) {
    throw new Error(
      "[Pattern] Rational arithmetic exceeds safe integer precision.",
    );
  }
  if (denominator > BigInt(MAX_RATIONAL_DENOMINATOR)) {
    throw new Error(
      `[Pattern] Rational denominator exceeds the maximum of ${MAX_RATIONAL_DENOMINATOR}.`,
    );
  }
  return Object.freeze({
    numerator: Number(numerator),
    denominator: Number(denominator),
  }) satisfies Rational;
}

function greatestCommonDivisor(a: bigint, b: bigint) {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) {
    [a, b] = [b, a % b];
  }
  return a;
}

// BigInt intermediates avoid both rounding and false overflow before reduction.
function addRational(a: Rational, b: Rational) {
  return normalizeRational(
    BigInt(a.numerator) * BigInt(b.denominator) +
      BigInt(b.numerator) * BigInt(a.denominator),
    BigInt(a.denominator) * BigInt(b.denominator),
  );
}

function subtractRational(a: Rational, b: Rational) {
  return normalizeRational(
    BigInt(a.numerator) * BigInt(b.denominator) -
      BigInt(b.numerator) * BigInt(a.denominator),
    BigInt(a.denominator) * BigInt(b.denominator),
  );
}

function multiplyRational(a: Rational, b: Rational) {
  return normalizeRational(
    BigInt(a.numerator) * BigInt(b.numerator),
    BigInt(a.denominator) * BigInt(b.denominator),
  );
}

function divideRational(a: Rational, b: Rational) {
  if (b.numerator === 0) {
    throw new Error("[Pattern] Cannot divide a rational by zero.");
  }
  return normalizeRational(
    BigInt(a.numerator) * BigInt(b.denominator),
    BigInt(a.denominator) * BigInt(b.numerator),
  );
}

function compareRational(a: Rational, b: Rational) {
  const difference =
    BigInt(a.numerator) * BigInt(b.denominator) -
    BigInt(b.numerator) * BigInt(a.denominator);
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function leastCommonMultiple(
  a: number,
  b: number,
  limit = MAX_RATIONAL_DENOMINATOR,
) {
  if (
    !Number.isSafeInteger(a) ||
    a <= 0 ||
    !Number.isSafeInteger(b) ||
    b <= 0 ||
    !Number.isSafeInteger(limit) ||
    limit <= 0
  ) {
    throw new Error(
      "[Pattern] Grid lengths and limits must be positive safe integers.",
    );
  }
  const left = BigInt(a);
  const right = BigInt(b);
  const result = (left / greatestCommonDivisor(left, right)) * right;
  if (result > BigInt(limit)) {
    throw new Error(`[Pattern] Grid exceeds the maximum of ${limit} steps.`);
  }
  return Number(result);
}

function rationalToGridIndex(value: Rational, resolution: number) {
  if (!Number.isSafeInteger(resolution) || resolution <= 0) {
    throw new Error(
      "[Pattern] Grid resolution must be a positive safe integer.",
    );
  }
  const index = multiplyRational(value, createRational(resolution));
  if (index.denominator !== 1) {
    throw new Error(
      "[Pattern] Rational position does not align with the step grid.",
    );
  }
  return index.numerator;
}

export {
  createRational,
  parseRational,
  addRational,
  subtractRational,
  multiplyRational,
  divideRational,
  compareRational,
  leastCommonMultiple,
  rationalToGridIndex,
};
export type { Rational };
