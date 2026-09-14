import type { TimingPattern } from "@web-audio/schema";
import ChanceResolver from "@/resolvers/chance-resolver";
import type { ResolvedTimingEvent } from "@/types";

function resolveTiming(timing: TimingPattern, barIndex: number) {
  const candidates = timing.cycle[barIndex % timing.cycle.length];
  const decisions = timing.condition
    ? new ChanceResolver(timing.condition).resolveBar(
        barIndex,
        candidates.length,
      )
    : null;
  const events: ResolvedTimingEvent[] = [];

  for (const [candidateIndex, candidate] of candidates.entries()) {
    if (decisions && !decisions[candidateIndex]) continue;

    events.push({
      hitIndex: events.length,
      offset: candidate.offset,
      duration: candidate.duration,
    });
  }

  return events;
}

export { resolveTiming };
