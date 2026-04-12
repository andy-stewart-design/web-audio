import BaseCycle from "../base-cycle";
import RandomCycle from "../random-cycle";

export function isCycle(value: unknown): value is BaseCycle<any> {
  return value instanceof BaseCycle;
}

export function isRandomCycle(value: unknown): value is RandomCycle {
  return value instanceof RandomCycle;
}
