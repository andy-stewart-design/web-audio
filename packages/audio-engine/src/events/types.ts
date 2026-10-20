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

export type {
  EventScheduleContext,
  ResolvedTimingEvent,
  ResolvedSynthEvent,
  ResolvedSamplerVoice,
  ResolvedSamplerEvent,
};
