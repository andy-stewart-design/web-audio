import type {
  NotesSchema,
  ParameterSchema,
  StaticSchema,
  StaticSchemaValue,
} from "@web-audio/schema";
import { getStaticOnsetForHit, groupStaticOnsets } from "./static-onsets";

interface ResolvedNoteEvent {
  hitIndex: number;
  gridStepIndex: number;
  offset: number;
  duration: number;
  voices: number[];
}

type ParameterValueResolver = (
  schema: ParameterSchema,
  barIndex: number,
  valueIndex: number,
) => number;

interface ResolveNoteEventsOptions {
  notes: NotesSchema;
  barIndex: number;
  resolveValue: ParameterValueResolver;
}

function getBar(schema: StaticSchema, barIndex: number) {
  if (schema.cycle.length === 0) return [];
  return schema.cycle[barIndex % schema.cycle.length] ?? [];
}

function resolveEvent(
  geometry: StaticSchemaValue,
  hitIndex: number,
  voices: number[],
) {
  return {
    hitIndex,
    gridStepIndex: geometry.stepIndex,
    offset: geometry.offset,
    duration: geometry.duration,
    voices,
  } satisfies ResolvedNoteEvent;
}

function resolveNoteEvents({
  notes,
  barIndex,
  resolveValue,
}: ResolveNoteEventsOptions) {
  const source = notes.source;
  const sourceBar =
    source.type === "static"
      ? getBar(source, barIndex)
      : getBar(source.grid, barIndex);
  if (sourceBar.length === 0) return [];

  const sourceGroups =
    source.type === "static" ? groupStaticOnsets(sourceBar) : null;
  const mask = notes.mask;

  if (!mask) {
    if (sourceGroups) {
      return sourceGroups.map((group) =>
        resolveEvent(
          group.voices[0],
          group.hitIndex,
          group.voices.map(({ value }) => value),
        ),
      );
    }

    const events: ResolvedNoteEvent[] = [];
    for (const geometry of sourceBar) {
      if (geometry.value === 0) continue;
      const hitIndex = events.length;
      events.push(
        resolveEvent(geometry, hitIndex, [
          resolveValue(source, barIndex, hitIndex),
        ]),
      );
    }
    return events;
  }

  if (sourceGroups?.length === 0) return [];

  const maskBar =
    mask.type === "static"
      ? getBar(mask, barIndex)
      : getBar(mask.grid, barIndex);
  const events: ResolvedNoteEvent[] = [];

  for (const geometry of maskBar) {
    if (geometry.value === 0) continue;
    // Random-mask eligibility is intentionally grid-addressed: the mask must
    // decide whether this geometric onset survives before a hit index exists.
    if (
      mask.type === "random" &&
      resolveValue(mask, barIndex, geometry.stepIndex) === 0
    ) {
      continue;
    }

    const hitIndex = events.length;
    const sourceOnset = sourceGroups
      ? getStaticOnsetForHit(sourceGroups, hitIndex)
      : null;
    const voices = sourceOnset
      ? sourceOnset.voices.map(({ value }) => value)
      : [resolveValue(source, barIndex, hitIndex)];
    events.push(resolveEvent(geometry, hitIndex, voices));
  }

  return events;
}

export { resolveNoteEvents };
export type {
  ParameterValueResolver,
  ResolvedNoteEvent,
  ResolveNoteEventsOptions,
};
