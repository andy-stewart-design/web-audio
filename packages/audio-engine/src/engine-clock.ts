import type AudioClock from "@web-audio/clock";
import type { SchedulerClock } from "./midi/midi-output-scheduler";

// Derive event/tempo capabilities from the production clock and retain the
// scheduler's existing minimal timing boundary (including currentTime only).
type EngineClock = Pick<AudioClock, "on" | "bpm" | "barDuration"> &
  SchedulerClock;

export type { EngineClock };
