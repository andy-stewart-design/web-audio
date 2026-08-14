import type { BinaryCycleData } from "../types";

function binary(value: number): 0 | 1 {
  return value ? 1 : 0;
}

export function xox(
  ...steps: (number | number[])[] | string[]
): BinaryCycleData {
  return steps.map((step) => {
    if (typeof step === "string") {
      return step
        .split("")
        .reduce<BinaryCycleData[number]>((pattern, value) => {
          if (value.trim()) pattern.push(binary(value.trim() === "x" ? 1 : 0));
          return pattern;
        }, []);
    }
    return Array.isArray(step) ? step.map(binary) : [binary(step)];
  });
}
