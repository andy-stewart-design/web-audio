import type { SynthEventSchema } from "@web-audio/schema";
import type { ResolvedSynthEvent } from "@/types";
import { resolveTiming } from "./resolve-timing";
import ValuePatternResolver from "./value-pattern-resolver";

function resolveSynthEvents(
  events: SynthEventSchema,
  barIndex: number,
  valueResolver = new ValuePatternResolver(),
) {
  return resolveTiming(events.timing, barIndex).map((timing) => {
    const resolvedNotes = valueResolver.resolve(
      events.notes,
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
