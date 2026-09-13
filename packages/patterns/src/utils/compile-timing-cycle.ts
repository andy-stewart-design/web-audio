import type { Cycle, TimingSchema, TimingStep } from "../types";

function compileTimingCycle(source: Cycle<1 | 0>) {
  const cycle = source.map((pattern) => {
    if (pattern.length === 0) return [];

    const duration = 1 / pattern.length;
    return pattern.reduce<TimingStep[]>((steps, value, index) => {
      if (value === 1) {
        steps.push({ duration, offset: duration * index });
      }
      return steps;
    }, []);
  });

  return { cycle } satisfies TimingSchema;
}

export default compileTimingCycle;
