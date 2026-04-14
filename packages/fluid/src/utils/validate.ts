import { RandomCycle } from "@web-audio/patterns";

function isRandomCycleTuple<T>(v: unknown[]): v is [T] {
  return v.length === 1 && v[0] instanceof RandomCycle;
}

function isRandomCycle<T>(v: unknown): v is RandomCycle {
  return v instanceof RandomCycle;
}

export { isRandomCycle, isRandomCycleTuple };
