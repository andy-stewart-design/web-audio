import type { NamedSampleBank, SampleBank } from "@/types";
import type { BankDefinition, BankSchema } from "@web-audio/schema";

function resolveBank(def: BankDefinition): BankSchema {
  const samples: Record<string, string[]> = {};
  for (const [name, paths] of Object.entries(def.samples)) {
    samples[name] = paths.map((p) => def.basePath + p);
  }
  return { samples };
}

function isSampleBank(obj: unknown): obj is SampleBank {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;

  return Object.values(obj as Record<string, unknown>).every(
    (value) =>
      Array.isArray(value) && value.every((item) => typeof item === "string"),
  );
}

function isNamedBank(obj: unknown): obj is NamedSampleBank {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;

  const record = obj as Record<string, unknown>;

  if (typeof record.name !== "string") return false;

  return isSampleBank(record.samples);
}

export { isNamedBank, isSampleBank, resolveBank };
