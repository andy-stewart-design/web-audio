import type { Cycle } from "./types";
import type { TimingPattern, TimingStep } from "@web-audio/schema";

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

  return { cycle } satisfies TimingPattern;
}

export default compileTimingCycle;
