export function sequence(stepCount: number, ...steps: (number | number[])[]) {
  return steps.map((p) =>
    Array.from({ length: stepCount }, (_, i) => {
      return [p].flat().includes(i) ? 1 : 0;
    }),
  );
}
