import type {
  NotesSchema,
  ParameterSchema,
  StaticSchema,
  StaticSchemaValue,
} from "@web-audio/schema";
import { getStaticOnsetForHit, groupStaticOnsets } from "./static-onsets";

interface MaterializedBarEvent {
  hitIndex: number;
  gridStepIndex: number;
  offset: number;
  duration: number;
  voices: number[];
}

type ParameterResolver = (
  schema: ParameterSchema,
  barIndex: number,
  valueIndex: number,
) => number;

interface MaterializeBarEventsOptions {
  notes: NotesSchema;
  barIndex: number;
  resolve: ParameterResolver;
}

function getBar(schema: StaticSchema, barIndex: number) {
  if (schema.cycle.length === 0) return [];
  return schema.cycle[barIndex % schema.cycle.length] ?? [];
}

function materializeEvent(
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
  } satisfies MaterializedBarEvent;
}

function materializeBarEvents({
  notes,
  barIndex,
  resolve,
}: MaterializeBarEventsOptions) {
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
        materializeEvent(
          group.voices[0],
          group.hitIndex,
          group.voices.map(({ value }) => value),
        ),
      );
    }

    const events: MaterializedBarEvent[] = [];
    for (const geometry of sourceBar) {
      if (geometry.value === 0) continue;
      const hitIndex = events.length;
      events.push(
        materializeEvent(geometry, hitIndex, [
          resolve(source, barIndex, hitIndex),
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
  const events: MaterializedBarEvent[] = [];

  for (const geometry of maskBar) {
    if (geometry.value === 0) continue;
    if (
      mask.type === "random" &&
      resolve(mask, barIndex, geometry.stepIndex) === 0
    ) {
      continue;
    }

    const hitIndex = events.length;
    const sourceOnset = sourceGroups
      ? getStaticOnsetForHit(sourceGroups, hitIndex)
      : null;
    const voices = sourceOnset
      ? sourceOnset.voices.map(({ value }) => value)
      : [resolve(source, barIndex, hitIndex)];
    events.push(materializeEvent(geometry, hitIndex, voices));
  }

  return events;
}

export { materializeBarEvents };
export type {
  MaterializedBarEvent,
  MaterializeBarEventsOptions,
  ParameterResolver,
};
