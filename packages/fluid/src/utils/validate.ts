import { RandomCycle } from "@web-audio/patterns";
import Envelope from "@/automations/envelope";

function isRandomCycleTuple<T>(v: unknown[]): v is [T] {
  return v.length === 1 && v[0] instanceof RandomCycle;
}

function isRandomCycle(v: unknown): v is RandomCycle {
  return v instanceof RandomCycle;
}

function isEnvelopeTuple(v: unknown[]): v is [Envelope] {
  return v.length === 1 && v[0] instanceof Envelope;
}

export { isEnvelopeTuple, isRandomCycle, isRandomCycleTuple };
