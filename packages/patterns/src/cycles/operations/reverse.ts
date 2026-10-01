import type { Cycle } from "../types";

export function reverse<S>(cycle: Cycle<S>) {
  return cycle
    .slice()
    .reverse()
    .map((arr) => arr?.slice().reverse());
}
