import { RandomCycle } from "@web-audio/patterns";
import Envelope from "@/automations/envelope";
import Lfo from "@/automations/lfo";
import { MidiCc } from "@/midi";

function isRandomCycleTuple<T>(v: unknown[]): v is [T] {
  return v.length === 1 && v[0] instanceof RandomCycle;
}

function isRandomCycle(v: unknown): v is RandomCycle {
  return v instanceof RandomCycle;
}

function isEnvelopeTuple(v: unknown[]): v is [Envelope] {
  return v.length === 1 && v[0] instanceof Envelope;
}

function isLfoTuple(v: unknown[]): v is [Lfo] {
  return v.length === 1 && v[0] instanceof Lfo;
}

function isMidiCcTuple(v: unknown[]): v is [MidiCc] {
  return v.length === 1 && v[0] instanceof MidiCc;
}

export {
  isEnvelopeTuple,
  isLfoTuple,
  isMidiCcTuple,
  isRandomCycle,
  isRandomCycleTuple,
};
