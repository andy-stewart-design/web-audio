function normalizeBusName(name: string) {
  if (typeof name !== "string") {
    throw new Error("Bus name must be a string.");
  }

  const normalized = name.trim();
  if (normalized.length === 0) {
    throw new Error("Bus name must not be empty.");
  }
  return normalized;
}

function normalizeBusTargets(targets: string | string[]) {
  const values = Array.isArray(targets) ? targets : [targets];
  return values.map(normalizeBusName);
}

function requireFinite(value: number, label: string) {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function normalizeBusGain(value: number) {
  const gain = requireFinite(value, "Bus gain");
  if (gain < 0) {
    throw new Error("Bus gain must be greater than or equal to zero.");
  }
  return gain;
}

function normalizeSendAmount(value: number) {
  const amount = requireFinite(value, "Send amount");
  if (amount < 0 || amount > 1) {
    throw new Error("Send amount must be between zero and one.");
  }
  return amount;
}

function normalizeDuckDepth(value: number) {
  return Math.min(1, Math.max(0, requireFinite(value, "Duck depth")));
}

function normalizeDuckTiming(value: number, label: "onset" | "recovery") {
  return Math.max(0, requireFinite(value, `Duck ${label}`));
}

export {
  normalizeBusGain,
  normalizeBusName,
  normalizeBusTargets,
  normalizeDuckDepth,
  normalizeDuckTiming,
  normalizeSendAmount,
};
