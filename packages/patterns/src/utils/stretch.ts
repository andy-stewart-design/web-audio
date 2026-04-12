import type { Cycle } from "../types";

export function stretch<S>(cycle: Cycle<S>, bars: number, steps = 1) {
  bars = Math.round(bars);
  steps = Math.round(steps);

  const nextCycle: S[][] = [];

  for (const pattern of cycle) {
    const expanded =
      steps > 1 ? pattern.flatMap((step) => Array(steps).fill(step)) : pattern;
    for (let k = 0; k < Math.max(bars, 1); k++) {
      nextCycle.push([...expanded]);
    }
  }

  return nextCycle;
}
