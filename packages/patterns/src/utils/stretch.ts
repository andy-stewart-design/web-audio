import type { Cycle } from "../types";
import { assertCycleLimits } from "./cycle-limits";
import { isPositiveInteger } from "./validate";

export function stretch<S>(cycle: Cycle<S>, bars: number, steps = 1) {
  assertPositiveInteger(bars, "bars");
  assertPositiveInteger(steps, "steps");

  const nextCycle: S[][] = [];

  for (const pattern of cycle) {
    const expanded =
      steps > 1 ? pattern.flatMap((step) => Array(steps).fill(step)) : pattern;
    for (let k = 0; k < bars; k++) {
      nextCycle.push([...expanded]);
    }
  }

  assertCycleLimits(nextCycle);
  return nextCycle;
}

function assertPositiveInteger(value: number, argument: "bars" | "steps") {
  if (!isPositiveInteger(value)) {
    throw new Error(
      `[Pattern] stretch() ${argument} must be a positive finite integer.`,
    );
  }
}
