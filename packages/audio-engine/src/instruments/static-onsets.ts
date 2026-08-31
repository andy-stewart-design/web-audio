import type { StaticSchemaValue } from "@web-audio/schema";

interface StaticOnsetGroup {
  hitIndex: number;
  voices: StaticSchemaValue[];
}

function groupStaticOnsets(bar: readonly StaticSchemaValue[]) {
  const groups: StaticOnsetGroup[] = [];
  const groupsByGridStep = new Map<number, StaticOnsetGroup>();

  for (const voice of bar) {
    const existing = groupsByGridStep.get(voice.stepIndex);
    if (existing) {
      existing.voices.push(voice);
      continue;
    }

    const group = {
      hitIndex: groups.length,
      voices: [voice],
    } satisfies StaticOnsetGroup;
    groups.push(group);
    groupsByGridStep.set(voice.stepIndex, group);
  }

  return groups;
}

function getStaticOnsetForHit(
  groups: readonly StaticOnsetGroup[],
  hitIndex: number,
) {
  if (groups.length === 0) return null;
  return groups[hitIndex % groups.length] ?? null;
}

export { getStaticOnsetForHit, groupStaticOnsets };
export type { StaticOnsetGroup };
