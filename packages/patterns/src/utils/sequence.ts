import type { BinaryCycleData } from "../types";

export function sequence(
  stepCount: number,
  ...steps: (number | number[])[]
): BinaryCycleData {
  return steps.map((step) =>
    Array.from({ length: stepCount }, (_, index): 0 | 1 => {
      return [step].flat().includes(index) ? 1 : 0;
    }),
  );
}
