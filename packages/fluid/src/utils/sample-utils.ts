import type { BankDefinition, BankSchema } from "@web-audio/schema";

function resolveBank(def: BankDefinition): BankSchema {
  const samples: Record<string, string[]> = {};
  for (const [name, paths] of Object.entries(def.samples)) {
    samples[name] = paths.map((p) => def.basePath + p);
  }
  return { samples };
}

export { resolveBank };
