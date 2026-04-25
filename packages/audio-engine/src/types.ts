import type { EnvelopeMode, EnvelopeSchema } from "@web-audio/schema";

interface ScheduledNote {
  sourceNode: AudioScheduledSourceNode;
  audioNodes: AudioNode[];
  startTime: number;
}

interface ResolvedEnvelopeSchema {
  min: number;
  max: number;
  a: number;
  d: number;
  s: number;
  r: number;
  mode: EnvelopeMode;
}

interface NormalizedADSR {
  a: number;
  d: number;
  s: number;
  r: number;
}

interface EnvelopeParams {
  min: number;
  max: number;
  sustain: number;
  startTime: number;
  endTime: number;
  attackDur: number;
  decayDur: number;
  releaseDur: number;
}

type ResolvedDetune =
  | { type: "static"; value: number }
  | { type: "envelope"; value: number; schema: EnvelopeSchema };

export type {
  EnvelopeParams,
  NormalizedADSR,
  ResolvedDetune,
  ResolvedEnvelopeSchema,
  ScheduledNote,
};
