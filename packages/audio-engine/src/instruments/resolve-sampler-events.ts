import type { SamplerEventPattern } from "@web-audio/schema";
import type { ResolvedSamplerEvent, ResolvedSamplerVoice } from "@/types";
import { resolveTiming } from "./resolve-timing";
import ValuePatternResolver from "./value-pattern-resolver";

function resolveSamplerEvents(
  eventPattern: SamplerEventPattern,
  barIndex: number,
  valueResolver = new ValuePatternResolver(),
) {
  return resolveTiming(eventPattern.timing, barIndex).map((timing) => {
    const notes = eventPattern.notes
      ? resolveNumberGroup(
          valueResolver.resolve(eventPattern.notes, barIndex, timing.hitIndex),
          "sampler notes",
        )
      : undefined;
    const sampleNames = resolveGroup(
      valueResolver.resolve(
        eventPattern.sampleNames,
        barIndex,
        timing.hitIndex,
      ),
      "sampler sample names",
    );
    const variationIndices = eventPattern.variationIndices
      ? resolveNumberGroup(
          valueResolver.resolve(
            eventPattern.variationIndices,
            barIndex,
            timing.hitIndex,
          ),
          "sampler variation indices",
        )
      : [0];
    const voiceCount = Math.max(
      notes?.length ?? 0,
      sampleNames.length,
      variationIndices.length,
    );
    const voices: ResolvedSamplerVoice[] = [];

    for (let voiceIndex = 0; voiceIndex < voiceCount; voiceIndex++) {
      voices.push({
        ...(notes && { note: notes[voiceIndex % notes.length] }),
        sampleName: sampleNames[voiceIndex % sampleNames.length],
        requestedVariationIndex:
          variationIndices[voiceIndex % variationIndices.length],
      });
    }

    return { ...timing, voices } satisfies ResolvedSamplerEvent;
  });
}

function resolveNumberGroup(value: number | number[] | null, label: string) {
  return typeof value === "number" ? [value] : resolveGroup(value, label);
}

function resolveGroup<T>(value: T[] | null, label: string) {
  if (value === null || value.length === 0) {
    throw new Error(`Cannot resolve ${label} from a silent value bar`);
  }
  return value;
}

export { resolveSamplerEvents };
