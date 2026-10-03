import type { BankDefinition } from "@web-audio/schema";
import tr808 from "./banks/tr808";
import tr909 from "./banks/tr909";
import rm50 from "./banks/rm50";
import loops from "./banks/loops";

export const BUILT_IN_BANKS: Record<string, BankDefinition> = {
  rm50,
  tr808,
  tr909,
  loops,
};
export const DEFAULT_BANK = "tr909";
