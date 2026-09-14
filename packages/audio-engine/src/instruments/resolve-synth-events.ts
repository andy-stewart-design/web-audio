import type { SynthEventPattern } from "@web-audio/schema";
import type { ResolvedSynthEvent } from "@/types";
import { resolveTiming } from "./resolve-timing";
import ValuePatternResolver from "./value-pattern-resolver";

function resolveSynthEvents(
  eventPattern: SynthEventPattern,
  barIndex: number,
  valueResolver = new ValuePatternResolver(),
) {
  return resolveTiming(eventPattern.timing, barIndex).map((timing) => {
    const resolvedNotes = valueResolver.resolve(
      eventPattern.notes,
      barIndex,
      timing.hitIndex,
    );
    if (resolvedNotes === null) {
      throw new Error("Cannot resolve synth notes from a silent value bar");
    }

    return {
      ...timing,
      notes: Array.isArray(resolvedNotes) ? resolvedNotes : [resolvedNotes],
    } satisfies ResolvedSynthEvent;
  });
}

export { resolveSynthEvents };
