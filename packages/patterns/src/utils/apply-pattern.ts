import type { Cycle } from "../types";

function applyPattern<T>(
  cycle: Cycle<T>,
  modifier: number[][],
  nullValue: T,
): Cycle<T> {
  const loops = Math.max(cycle.length, modifier.length);
  const result: Cycle<T> = [];

  for (let i = 0; i < loops; i++) {
    let noteIndex = 0;
    const bar = cycle[i % cycle.length] ?? [];

    const nextBar = modifier[i % modifier.length].map((p) =>
      p === 0 ? nullValue : bar[noteIndex++ % bar.length],
    );

    result.push(nextBar);
  }

  return result;
}

export { applyPattern };
