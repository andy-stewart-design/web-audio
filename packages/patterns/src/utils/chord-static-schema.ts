import type { Chord, Cycle, StaticSchema } from "../types";

function getChordStaticSchema(
  cycle: Cycle<Chord>,
  transformer?: (value: number) => number,
) {
  const serializedCycle = cycle.map((pattern) => {
    const stepDuration = 1 / pattern.length;

    return pattern.flatMap((chord, stepIndex) =>
      (chord ?? [])
        .filter((value) => typeof value === "number")
        .map((value) => ({
          value: transformer ? transformer(value) : value,
          offset: stepDuration * stepIndex,
          duration: stepDuration,
          stepIndex,
        })),
    );
  });

  return {
    type: "static",
    polyphonic: true,
    cycle: serializedCycle,
  } satisfies StaticSchema;
}

export { getChordStaticSchema };
