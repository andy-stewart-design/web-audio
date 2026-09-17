function isNonNegativeInteger(value: unknown) {
  if (typeof value !== "number") return false;
  return Number.isFinite(value) && value >= 0 && Number.isInteger(value);
}

function isPositiveInteger(value: unknown) {
  if (typeof value !== "number") return false;
  return Number.isFinite(value) && value > 0 && Number.isInteger(value);
}

export { isPositiveInteger, isNonNegativeInteger };
