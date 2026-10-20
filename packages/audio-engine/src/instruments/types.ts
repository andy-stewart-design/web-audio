import type { EngineClock } from "../engine-clock";
import type { ScheduledSource } from "../sources/types";

// Instruments only read musical duration; they do not own transport or timers.
type InstrumentClock = Pick<EngineClock, "barDuration">;

interface ScheduledNote {
  sourceNodes: ScheduledSource[];
  startedSourceNodes: Set<ScheduledSource>;
  endedSourceNodes: Set<ScheduledSource>;
  disconnectedSourceNodes: Set<ScheduledSource>;
  audioNodes: Set<AudioNode>;
  completionCleanups: (() => void)[];
  startTime: number;
  released: boolean;
}

export type { InstrumentClock, ScheduledNote };
