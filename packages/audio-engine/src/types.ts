import type AudioClock from "@web-audio/clock";
import type {
  EnvelopeMode,
  EnvelopeSchema,
  LfoSchema,
  MidiCcSchema,
} from "@web-audio/schema";
import type { SchedulerClock } from "./midi-output-scheduler";

// Derive event/tempo capabilities from the production clock and retain the
// scheduler's existing minimal timing boundary (including currentTime only).
type EngineClock = Pick<AudioClock, "on" | "bpm" | "barDuration"> &
  SchedulerClock;

// Instruments only read musical duration; they do not own transport or timers.
type InstrumentClock = Pick<EngineClock, "barDuration">;

interface ScheduledNote {
  sourceNode: AudioScheduledSourceNode;
  audioNodes: AudioNode[];
  completionCleanups: (() => void)[];
  startTime: number;
}

interface EventScheduleContext {
  barIndex: number;
  hitIndex: number;
  startTime: number;
  duration: number;
  endTime: number;
}

interface ResolvedTimingEvent {
  hitIndex: number;
  offset: number;
  duration: number;
}

interface ResolvedSynthEvent extends ResolvedTimingEvent {
  notes: number[];
}

interface ResolvedSamplerVoice {
  note?: number;
  sampleName: string;
  requestedVariationIndex: number;
}

interface ResolvedSamplerEvent extends ResolvedTimingEvent {
  voices: ResolvedSamplerVoice[];
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
  | { type: "envelope"; value: number; schema: EnvelopeSchema }
  | { type: "lfo"; value: number; schema: LfoSchema }
  | { type: "midi-cc"; value: number; schema: MidiCcSchema };

export type {
  EngineClock,
  EnvelopeParams,
  EventScheduleContext,
  InstrumentClock,
  NormalizedADSR,
  ResolvedDetune,
  ResolvedEnvelopeSchema,
  ResolvedSamplerEvent,
  ResolvedSamplerVoice,
  ResolvedSynthEvent,
  ResolvedTimingEvent,
  ScheduledNote,
};
