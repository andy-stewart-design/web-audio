import type { NamedSampleBank } from "@/types";
import type { BankDefinition, BankSchema } from "@web-audio/schema";

function resolveBank(def: BankDefinition): BankSchema {
  const samples: Record<string, string[]> = {};
  for (const [name, paths] of Object.entries(def.samples)) {
    samples[name] = paths.map((p) => def.basePath + p);
  }
  return { samples };
}

function isNamedBank(obj: unknown): obj is NamedSampleBank {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;

  const record = obj as Record<string, unknown>;

  if (typeof record.name !== "string") return false;

  const { samples } = record;
  if (!samples || typeof samples !== "object" || Array.isArray(samples))
    return false;

  return Object.values(samples as Record<string, unknown>).every(
    (v) => Array.isArray(v) && v.every((item) => typeof item === "string"),
  );
}

export { isNamedBank, resolveBank };
