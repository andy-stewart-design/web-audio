import { RandomCycle } from "@web-audio/patterns";
import type { RandomNumberPattern } from "@web-audio/schema";
import type {
  EventSchemaFixture,
  EventScenarioOperation,
} from "./event-schema-fixtures";

const hit = (offset: number, duration: number) => ({ offset, duration });
const bar = (offsets: number[], duration: number) =>
  offsets.map((offset) => hit(offset, duration));
const names = (count: number, values = ["bd"]) =>
  ({
    type: "static",
    cycle: Array.from({ length: count }, () => values.map((value) => [value])),
  }) as const;
const randomVariations = {
  type: "random-number",
  valuesPerBar: [2, 0],
  dataType: "integer",
  segments: [{ seed: 11 }],
  range: { min: -1, max: 4 },
  algorithm: "xor",
  order: "forward",
} satisfies RandomNumberPattern;

type NativeRegressionFixture = Pick<
  EventSchemaFixture,
  "name" | "instrument" | "sampleName" | "operations"
> & {
  prefixes: { length: number; expected: EventSchemaFixture["expected"] }[];
};

// Retained, explicit spec expectations for the four generated sequences that
// exposed approved legacy differences. These are NOT replacements for PR 2
// goldens. Neither the generated driver nor legacy output creates expectations.
const approvedExceptionScenarios = [
  {
    name: "immediate implicit slow/fast geometry survives note replacement and stretch",
    instrument: "synth",
    operations: () => [
      { method: "notes", args: [[60, null, 64]] },
      { method: "slow", args: [2] },
      { method: "root", args: ["c4"] },
      { method: "fast", args: [2] },
      { method: "notes", args: [[60, null, 64]] },
      { method: "xox", args: [[1, 1, 1, 1]] },
      { method: "notes", args: [[60, null, 64]] },
      { method: "stretch", args: [2, 2] },
    ],
    prefixes: [
      {
        length: 6,
        expected: {
          timing: { cycle: [[hit(0, 0.25)]] },
          notes: { type: "static", cycle: [[[120]]] },
        },
      },
      {
        length: 7,
        expected: {
          timing: { cycle: [[hit(0, 0.25)]] },
          notes: { type: "static", cycle: [[[120]]] },
        },
      },
      {
        length: 8,
        expected: {
          timing: { cycle: [bar([0, 0.125], 0.125), bar([0, 0.125], 0.125)] },
          notes: {
            type: "static",
            cycle: [
              [[120], [120]],
              [[120], [120]],
            ],
          },
        },
      },
    ],
  },
  {
    name: "implicit speed chains remain materialized through sparse timing composition",
    instrument: "synth",
    operations: () => [
      { method: "stretch", args: [2, 2] },
      { method: "fast", args: [2] },
      { method: "slow", args: [2] },
      { method: "notes", args: [[60, null, 64]] },
      { method: "xox", args: [[1, 0, 1]] },
      { method: "notes", args: [0] },
      { method: "fast", args: [2] },
      { method: "xox", args: [[1, 1, 1, 1]] },
    ],
    prefixes: [
      {
        length: 6,
        expected: {
          timing: { cycle: [[hit(0, 1 / 3)], [hit(0, 1 / 3)]] },
          notes: { type: "static", cycle: [[[0]], [[0]]] },
        },
      },
      {
        length: 7,
        expected: {
          timing: { cycle: [bar([0, 0.5], 1 / 6)] },
          notes: { type: "static", cycle: [[[0], [0]]] },
        },
      },
      {
        length: 8,
        expected: {
          timing: { cycle: [bar([0, 0.75], 0.25)] },
          notes: { type: "static", cycle: [[[0], [0]]] },
        },
      },
    ],
  },
  {
    name: "synth materialized slowdown rests still filter a composed sparse replacement",
    instrument: "synth",
    operations: () => [
      { method: "slow", args: [2] },
      {
        method: "notes",
        args: [
          [
            [60, 60],
            [64, null, 67],
          ],
        ],
      },
      { method: "root", args: ["c4"] },
      { method: "reverse", args: [] },
      { method: "xox", args: [new RandomCycle().bin().steps(3, 0).chance(1)] },
      {
        method: "notes",
        args: [
          [
            [60, 60],
            [64, null, 67],
          ],
        ],
      },
      { method: "slow", args: [2] },
      { method: "xox", args: [[1, 0, 1]] },
    ],
    prefixes: [
      {
        length: 8,
        expected: {
          timing: { cycle: [[hit(0, 1 / 3)], [], [], []] },
          notes: {
            type: "static",
            cycle: [[[120, 120]], [null], [null], [null]],
          },
        },
      },
    ],
  },
  {
    name: "sampler implicit speed geometry survives notes, random variation, and name replacement",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "fast", args: [2] },
      { method: "slow", args: [2] },
      {
        method: "notes",
        args: [
          [
            [60, 60],
            [64, null, 67],
          ],
        ],
      },
      { method: "scale", args: ["maj"] },
      { method: "xox", args: [[1, 1, 1, 1]] },
      {
        method: "variation",
        args: [new RandomCycle().int().range(-1, 4).steps(2, 0).ribbon(11)],
      },
      { method: "name", args: [["bd", null, "sd"]] },
      { method: "notes", args: [0] },
    ],
    prefixes: [
      {
        length: 5,
        expected: {
          timing: { cycle: [bar([0, 0.5], 0.25), bar([0, 0.5], 0.25)] },
          sampleNames: names(2),
          notes: {
            type: "static",
            cycle: [
              [
                [103, 103],
                [110, 115],
              ],
              [
                [103, 103],
                [110, 115],
              ],
            ],
          },
        },
      },
      {
        length: 6,
        expected: {
          timing: { cycle: [bar([0, 0.5], 0.25), []] },
          sampleNames: names(2),
          notes: {
            type: "static",
            cycle: [
              [
                [103, 103],
                [110, 115],
              ],
              [null],
            ],
          },
          variationIndices: randomVariations,
        },
      },
      {
        length: 7,
        expected: {
          timing: { cycle: [[hit(0, 0.25)], []] },
          sampleNames: names(2, ["bd", "sd"]),
          notes: { type: "static", cycle: [[[103, 103]], [null]] },
          variationIndices: randomVariations,
        },
      },
      {
        length: 8,
        expected: {
          timing: { cycle: [[hit(0, 0.25)], []] },
          sampleNames: names(2, ["bd", "sd"]),
          notes: { type: "static", cycle: [[[0]], [null]] },
          variationIndices: randomVariations,
        },
      },
    ],
  },
] satisfies NativeRegressionFixture[];

const feasibilityScenarios = [
  {
    name: "slowdown-created note rests filter replacement candidates while inherited gaps stay transparent",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "notes", args: [[60, 64]] },
      { method: "xox", args: [[1, 0, 1]] },
      { method: "slow", args: [2] },
      { method: "xox", args: [new RandomCycle().bin().steps(4).chance(1)] },
    ],
    expected: {
      timing: { cycle: [bar([0, 0.5], 0.25), [hit(0.25, 0.25)]] },
      sampleNames: names(2),
      notes: { type: "static", cycle: [[[60], [60]], [[64]]] },
    },
  },
  {
    name: "slowdown-created variation rests filter replacement candidates while inherited gaps stay transparent",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "variation", args: [[0, 2]] },
      { method: "xox", args: [[1, 0, 1]] },
      { method: "slow", args: [2] },
      { method: "xox", args: [new RandomCycle().bin().steps(4).chance(1)] },
    ],
    expected: {
      timing: { cycle: [bar([0, 0.5], 0.25), [hit(0.25, 0.25)]] },
      sampleNames: names(2),
      variationIndices: { type: "static", cycle: [[[0]], [[2]]] },
    },
  },
  {
    name: "shared timing intersection is not reapplied across consecutive reversals",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "notes", args: [[60, null, 64]] },
      { method: "var", args: [[0, null, 2]] },
      { method: "reverse", args: [] },
      { method: "reverse", args: [] },
    ],
    expected: {
      timing: { cycle: [[hit(0, 1 / 3)]] },
      sampleNames: names(1),
      notes: { type: "static", cycle: [[[60]]] },
      variationIndices: { type: "static", cycle: [[[0]]] },
    },
  },
  {
    name: "empty note bars suppress hits without taking authored-rest timing priority",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "notes", args: [[], [60]] },
      { method: "var", args: [[0, 1]] },
    ],
    expected: {
      timing: { cycle: [[], bar([0, 0.5], 0.5)] },
      sampleNames: names(2),
      notes: { type: "static", cycle: [[null], [[60], [60]]] },
      variationIndices: {
        type: "static",
        cycle: [
          [[0], [1]],
          [[0], [1]],
        ],
      },
    },
  },
  {
    name: "explicit note rests retain authored-rest timing priority unlike empty bars",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "notes", args: [[null], [60]] },
      { method: "var", args: [[0, 1]] },
    ],
    expected: {
      timing: { cycle: [[], [hit(0, 1)]] },
      sampleNames: names(2),
      notes: { type: "static", cycle: [[null], [[60]]] },
      variationIndices: {
        type: "static",
        cycle: [
          [[0], [1]],
          [[0], [1]],
        ],
      },
    },
  },
  {
    name: "original one-slot notes remain materialization-exempt after slowdown and timing replacement",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "notes", args: [60] },
      { method: "slow", args: [2] },
      { method: "xox", args: [new RandomCycle().bin().steps(4).chance(1)] },
      { method: "reverse", args: [] },
    ],
    expected: {
      timing: { cycle: [[], bar([0, 0.25, 0.5, 0.75], 0.25)] },
      sampleNames: names(2),
      notes: { type: "static", cycle: [[null], [[60], [60], [60], [60]]] },
    },
  },
  {
    name: "authored notes deactivate generated fit without losing the authored pattern",
    instrument: "sampler",
    sampleName: "loop",
    operations: () => [
      { method: "fit", args: [2] },
      { method: "notes", args: [[60, 64]] },
    ],
    expected: {
      timing: { cycle: [bar([0, 0.5], 0.5)] },
      sampleNames: names(1, ["loop"]),
      notes: { type: "static", cycle: [[[60], [64]]] },
    },
  },
  {
    name: "synth slowdown rests filter replacement timing by candidate ordinal",
    instrument: "synth",
    operations: () => [
      { method: "notes", args: [[60, 64]] },
      { method: "slow", args: [2] },
      { method: "xox", args: [new RandomCycle().bin().steps(4).chance(1)] },
    ],
    expected: {
      timing: { cycle: [bar([0, 0.5], 0.25), bar([0, 0.5], 0.25)] },
      notes: {
        type: "static",
        cycle: [
          [[60], [60]],
          [[64], [64]],
        ],
      },
    },
  },
  {
    name: "zero-width empty note bars compress transparently under generated chop timing",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "chop", args: [4] },
      { method: "fit", args: [2] },
      { method: "notes", args: [[60], []] },
      { method: "fast", args: [2] },
    ],
    expected: {
      timing: { cycle: [bar([0, 0.5], 0.5), bar([0, 0.5], 0.5)] },
      sampleNames: names(2),
      notes: {
        type: "static",
        cycle: [
          [[60], [60]],
          [[60], [60]],
        ],
      },
    },
  },
  {
    name: "explicit note rests retain width and filter generated chop candidates after compression",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "chop", args: [4] },
      { method: "fit", args: [2] },
      { method: "notes", args: [[60], [null]] },
      { method: "fast", args: [2] },
    ],
    expected: {
      timing: { cycle: [[hit(0, 0.5)], [hit(0, 0.5)]] },
      sampleNames: names(2),
      notes: { type: "static", cycle: [[[60]], [[60]]] },
    },
  },
  {
    name: "explicit chop sequence timing is derived from processing counts and stays transform-exempt",
    instrument: "sampler",
    sampleName: "loop",
    operations: () => [
      { method: "chop", args: [4, [0, 1, 0]] },
      { method: "fit", args: [4] },
      { method: "slow", args: [2] },
    ],
    expected: {
      timing: { cycle: [bar([0, 1 / 3, 2 / 3], 1 / 3)] },
      sampleNames: names(1, ["loop"]),
    },
  },
  {
    name: "default-count random chop sequences distribute generated counts across fit bars",
    instrument: "sampler",
    sampleName: "loop",
    operations: () => [
      { method: "chop", args: [2, new RandomCycle().int().steps(1).ribbon(7)] },
      { method: "fit", args: [4] },
      { method: "reverse", args: [] },
    ],
    expected: {
      timing: { cycle: [[hit(0, 1)], [], [hit(0, 1)], []] },
      sampleNames: names(4, ["loop"]),
    },
  },
] satisfies EventSchemaFixture[];

const immediateSpeedScenarios = [
  {
    name: "synth fluent speeds preserve immediate gates regardless of compiler reads",
    instrument: "synth",
    operations: () => [
      { method: "notes", args: [60] },
      { method: "fast", args: [2] },
      { method: "slow", args: [2] },
    ],
    expected: {
      timing: { cycle: [[hit(0, 0.5)], [hit(0, 0.5)]] },
      notes: { type: "static", cycle: [[[60]], [[60]]] },
    },
  },
  {
    name: "sampler fluent speeds preserve immediate gates regardless of compiler reads",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "notes", args: [60] },
      { method: "fast", args: [2] },
      { method: "slow", args: [2] },
    ],
    expected: {
      timing: { cycle: [[hit(0, 0.5)], [hit(0, 0.5)]] },
      sampleNames: names(2),
      notes: { type: "static", cycle: [[[60]], [[60]]] },
    },
  },
  {
    name: "generated timing stays exempt while fluent value speeds remain immediate and read-independent",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "chop", args: [2] },
      { method: "fit", args: [4] },
      { method: "notes", args: [60] },
      { method: "fast", args: [2] },
      { method: "slow", args: [2] },
    ],
    expected: {
      timing: { cycle: [[hit(0, 2)], [], [hit(0, 2)], []] },
      sampleNames: names(4),
      notes: { type: "static", cycle: [[[60]], [null], [[60]], [null]] },
    },
  },
] satisfies EventSchemaFixture[];

function placeholderOperations(
  placeholder: number[] | null | undefined | (null | undefined)[],
) {
  return [
    { method: "notes", args: [[60, placeholder, 64]] },
    { method: "reverse", args: [] },
  ] satisfies EventScenarioOperation[];
}

export {
  approvedExceptionScenarios,
  feasibilityScenarios,
  immediateSpeedScenarios,
  placeholderOperations,
};
