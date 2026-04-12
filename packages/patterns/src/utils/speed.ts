import type { Cycle } from "../types";

export function fast<S>(
  cycle: Cycle<S>,
  nullVal: S | undefined,
  mult: number,
): Cycle<S> | null {
  if (nullVal === undefined) return null;

  mult = Math.round(mult);
  if (mult <= 1) return null;

  const length = Math.ceil(cycle.length / mult);
  const numLoops = mult * length;
  const nextCyle: Cycle<S> = Array.from({ length }, () => []);

  for (let i = 0; i < numLoops; i++) {
    const v = cycle[i % cycle.length];
    nextCyle[Math.floor(i / mult)].push(...v);
  }

  return nextCyle;
}

export function slow<S>(
  cycle: Cycle<S>,
  nullVal: S | undefined,
  mult: number,
): Cycle<S> | null {
  if (nullVal === undefined) return null;

  mult = Math.round(mult);
  if (mult <= 1) return null;

  const nextCycle: Cycle<S> = [];

  for (const pat of cycle) {
    const expanded: Cycle<S>[number] = [];
    for (let i = 0; i < pat.length * mult; i++) {
      expanded.push(i % mult === 0 ? pat[i / mult] : nullVal);
    }
    for (let k = 0; k < mult; k++) {
      nextCycle.push(expanded.slice(k * pat.length, (k + 1) * pat.length));
    }
  }

  return nextCycle;
}
