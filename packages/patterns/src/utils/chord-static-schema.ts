import type { Chord, Cycle, StaticNotePattern } from "../types";

function getChordStaticSchema(
  cycle: Cycle<Chord>,
  transformer?: (value: number) => number,
) {
  const serializedCycle = cycle.map((pattern) => {
    const groups = pattern.flatMap((chord) => {
      const voices = (chord ?? [])
        .filter((value): value is number => typeof value === "number")
        .map((value) => (transformer ? transformer(value) : value));

      return voices.length === 0 ? [] : [voices];
    });

    return groups.length === 0 ? [null] : groups;
  });

  return {
    type: "static",
    cycle: serializedCycle,
  } satisfies StaticNotePattern;
}

export { getChordStaticSchema };
