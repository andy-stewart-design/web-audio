import type { DromeSchema } from "./index";

class SignalGraphValidationError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "SignalGraphValidationError";
    this.path = path;
  }
}

const fail = (path: string, message: string) => {
  throw new SignalGraphValidationError(path, message);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requireRecord = (value: unknown, path: string) => {
  if (!isRecord(value)) {
    throw new SignalGraphValidationError(path, "must be a record");
  }
  return value;
};

const requireFiniteNumber = (value: unknown, path: string) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SignalGraphValidationError(path, "must be a finite number");
  }
  return value;
};

const validateCanonicalName = (name: string, path: string) => {
  if (name.length === 0) fail(path, "must not be empty");
  if (name !== name.trim()) fail(path, "must not have surrounding whitespace");
};

const validateEffects = (value: unknown, path: string) => {
  if (!Array.isArray(value)) {
    throw new SignalGraphValidationError(path, "must be an array");
  }

  value.forEach((effect, index) => {
    const effectPath = `${path}[${index}]`;
    const record = requireRecord(effect, effectPath);
    if (record.type !== "filter" && record.type !== "gain") {
      fail(`${effectPath}.type`, "must be a supported effect discriminator");
    }
  });
};

const validateBusTarget = (
  target: string,
  path: string,
  buses: Record<string, unknown>,
  allowMain: boolean,
) => {
  validateCanonicalName(target, path);
  if (!allowMain && target === "main") fail(path, "must not target main");
  if (!Object.prototype.hasOwnProperty.call(buses, target)) {
    fail(path, `references undeclared bus ${JSON.stringify(target)}`);
  }
};

const validateSignalGraph = (schema: DromeSchema) => {
  const root = requireRecord(schema, "schema");

  if (root.bpm !== undefined) {
    const bpm = requireFiniteNumber(root.bpm, "bpm");
    if (bpm <= 0) fail("bpm", "must be greater than zero");
  }

  const buses = requireRecord(root.buses, "buses");
  if (!Object.prototype.hasOwnProperty.call(buses, "main")) {
    fail("buses.main", "is required");
  }

  for (const [name, bus] of Object.entries(buses)) {
    const path = `buses[${JSON.stringify(name)}]`;
    validateCanonicalName(name, path);
    const record = requireRecord(bus, path);
    const gain = requireFiniteNumber(record.gain, `${path}.gain`);
    if (gain < 0) fail(`${path}.gain`, "must be greater than or equal to zero");
    validateEffects(record.effects, `${path}.effects`);
  }

  const instruments = root.instruments;
  if (!Array.isArray(instruments)) {
    throw new SignalGraphValidationError("instruments", "must be an array");
  }

  instruments.forEach((instrument, index) => {
    const path = `instruments[${index}]`;
    const record = requireRecord(instrument, path);

    const route = record.route;
    if (typeof route !== "string") {
      throw new SignalGraphValidationError(`${path}.route`, "must be a string");
    }
    validateBusTarget(route, `${path}.route`, buses, true);

    const sends = requireRecord(record.sends, `${path}.sends`);
    for (const [target, value] of Object.entries(sends)) {
      const targetPath = `${path}.sends[${JSON.stringify(target)}]`;
      validateBusTarget(target, targetPath, buses, false);
      const amount = requireFiniteNumber(value, targetPath);
      if (amount < 0 || amount > 1) {
        fail(targetPath, "must be between zero and one");
      }
    }

    const ducks = requireRecord(record.ducks, `${path}.ducks`);
    for (const [target, duck] of Object.entries(ducks)) {
      const targetPath = `${path}.ducks[${JSON.stringify(target)}]`;
      validateBusTarget(target, targetPath, buses, false);
      const duckRecord = requireRecord(duck, targetPath);
      const depth = requireFiniteNumber(
        duckRecord.depth,
        `${targetPath}.depth`,
      );
      if (depth < 0 || depth > 1) {
        fail(`${targetPath}.depth`, "must be between zero and one");
      }
      const onset = requireFiniteNumber(
        duckRecord.onset,
        `${targetPath}.onset`,
      );
      if (onset < 0) {
        fail(`${targetPath}.onset`, "must be greater than or equal to zero");
      }
      const recovery = requireFiniteNumber(
        duckRecord.recovery,
        `${targetPath}.recovery`,
      );
      if (recovery < 0) {
        fail(`${targetPath}.recovery`, "must be greater than or equal to zero");
      }
    }

    validateEffects(record.effects, `${path}.effects`);
  });
};

export { SignalGraphValidationError, validateSignalGraph };
