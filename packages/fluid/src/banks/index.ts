import type { BankDefinition } from "@web-audio/schema";
import tr808 from "./tr808";
import tr909 from "./tr909";
import rm50 from "./rm50";
import loops from "./loops";

export const BUILT_IN_BANKS: Record<string, BankDefinition> = {
  rm50,
  tr808,
  tr909,
  loops,
};
export const DEFAULT_BANK = "tr909";
