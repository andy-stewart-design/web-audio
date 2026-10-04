import { RandomCycle } from "@web-audio/patterns";
import type { EventScenarioOperation } from "./schema-fixtures";

// The same bounded sequence matrix used before cutover. Each invocation creates
// fresh public random sources, so native and public replay never share inputs.
function generateOperations(
  seed: number,
  kind: "synth" | "sampler" | "generated",
) {
  const pool: (() => EventScenarioOperation)[] = [
    () => ({ method: "notes", args: [[60, null, 64]] }),
    () => ({ method: "notes", args: [[60], []] }),
    () => ({
      method: "notes",
      args: [
        [
          [60, 60],
          [64, null, 67],
        ],
      ],
    }),
    () => ({ method: "notes", args: [0] }),
    () => ({
      method: "notes",
      args: [new RandomCycle().int().range(-2, 4).steps(2, 0).ribbon(9)],
    }),
    () => ({
      method: "notes",
      args: [new RandomCycle().bin().steps(2, 1).ribbon(7)],
    }),
    () => ({ method: "xox", args: [[1, 0, 1]] }),
    () => ({
      method: "xox",
      args: [
        [1, 1, 0, 1],
        [0, 1],
      ],
    }),
    () => ({
      method: "xox",
      args: [new RandomCycle().bin().steps(4).chance(0.25).ribbon(7, 8)],
    }),
    () => ({
      method: "xox",
      args: [new RandomCycle().bin().steps(3, 0).chance(1)],
    }),
    () => ({ method: "xox", args: [[1, 1, 1, 1]] }),
    () => ({ method: "root", args: ["c4"] }),
    () => ({ method: "scale", args: ["maj"] }),
    () => ({ method: "reverse", args: [] }),
    () => ({ method: "fast", args: [2] }),
    () => ({ method: "slow", args: [2] }),
    () => ({ method: "stretch", args: [2, 2] }),
  ];
  if (kind !== "synth") {
    pool.push(
      () => ({ method: "name", args: [["bd", null, "sd"]] }),
      () => ({ method: "name", args: [[["bd", "bd"], "sd"], ["hh"]] }),
      () => ({ method: "var", args: [[0, null, 2]] }),
      () => ({ method: "variation", args: [[0], [1, 2]] }),
      () => ({
        method: "variation",
        args: [new RandomCycle().int().range(-1, 4).steps(2, 0).ribbon(11)],
      }),
    );
  }
  if (kind === "generated") {
    pool.push(
      () => ({ method: "chop", args: [2] }),
      () => ({ method: "fit", args: [3] }),
    );
  }
  const operations: EventScenarioOperation[] = [];
  let random = seed;
  for (let index = 0; index < 8; index++) {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    operations.push(pool[(random >>> 16) % pool.length]());
  }
  return operations;
}

export { generateOperations };
