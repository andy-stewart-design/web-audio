import type { SamplerEventPattern, SynthEventPattern } from "@web-audio/schema";
import { RandomCycle } from "@web-audio/patterns";
import type Sampler from "@/instruments/sampler";

// Public facade signatures keep replay operations typed; no legacy state enters
// the native driver. These fixtures remain after the production cutover.
type EventScenarioMethod =
  | "notes"
  | "name"
  | "variation"
  | "var"
  | "xox"
  | "root"
  | "scale"
  | "reverse"
  | "fast"
  | "slow"
  | "stretch"
  | "chop"
  | "fit";
type EventScenarioOperation = {
  [Method in EventScenarioMethod]: {
    method: Method;
    args: Parameters<Sampler[Method]>;
  };
}[EventScenarioMethod];
type EventSchemaFixture = {
  name: string;
  instrument: "synth" | "sampler";
  sampleName?: string;
  operations: () => EventScenarioOperation[];
  expected: SynthEventPattern | SamplerEventPattern;
};

// PR 2 corrected schema baseline: expected patterns are unchanged.
// Intentional changes: candidate-ordinal sampler rest filtering, authored
// one-step patterns (including transformed rests), and constructor fallbacks.
const eventSchemaFixtures = [
  {
    name: "default synth timing and notes",
    instrument: "synth",
    operations: () => [],
    expected: {
      timing: { cycle: [[{ offset: 0, duration: 1 }]] },
      notes: { type: "static", cycle: [[[60]]] },
    },
  },
  {
    name: "explicit synth timing with a silent bar",
    instrument: "synth",
    operations: () => [
      { method: "notes", args: [[60], [null], [67]] },
      { method: "xox", args: [[1, 0, 1]] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 1 / 3 },
            { offset: 2 / 3, duration: 1 / 3 },
          ],
          [],
          [
            { offset: 0, duration: 1 / 3 },
            { offset: 2 / 3, duration: 1 / 3 },
          ],
        ],
        condition: undefined,
      },
      notes: {
        type: "static",
        cycle: [[[60], [60]], [null], [[67], [67]]],
      },
    },
  },
  {
    name: "sampler names, notes, and variations",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "notes", args: [[60, 64]] },
      { method: "name", args: [["bd", "sd"]] },
      { method: "variation", args: [[0, 2]] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.5 },
            { offset: 0.5, duration: 0.5 },
          ],
        ],
      },
      notes: { type: "static", cycle: [[[60], [64]]] },
      sampleNames: { type: "static", cycle: [[["bd"], ["sd"]]] },
      variationIndices: { type: "static", cycle: [[[0], [2]]] },
    },
  },
  {
    name: "random synth timing condition and zero-count bar",
    instrument: "synth",
    operations: () => [
      { method: "notes", args: [[60, 64]] },
      {
        method: "xox",
        args: [new RandomCycle().bin().steps(2, 0).chance(0.25).ribbon(7, 8)],
      },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.5 },
            { offset: 0.5, duration: 0.5 },
          ],
          [],
        ],
        condition: {
          type: "chance",
          probability: 0.25,
          segments: [{ seed: 7, len: 8 }],
          algorithm: "xor",
          order: "forward",
        },
      },
      notes: { type: "static", cycle: [[[60], [64]], [null]] },
    },
  },
  {
    name: "sampler notes retain timing priority when rests compete with denser variation",
    instrument: "sampler",
    sampleName: "kick",
    operations: () => [
      { method: "notes", args: [[60, null]] },
      { method: "variation", args: [[0, 1, 2]] },
    ],
    expected: {
      timing: {
        cycle: [[{ offset: 0, duration: 0.5 }]],
        condition: undefined,
      },
      sampleNames: { type: "static", cycle: [[["kick"]]] },
      notes: { type: "static", cycle: [[[60]]] },
      variationIndices: { type: "static", cycle: [[[0], [1], [2]]] },
    },
  },
  {
    name: "denser variation timing wins when no authored rests have priority",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "notes", args: [60] },
      { method: "variation", args: [[0, 1, 2]] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 1 / 3 },
            { offset: 1 / 3, duration: 1 / 3 },
            { offset: 2 / 3, duration: 1 / 3 },
          ],
        ],
        condition: undefined,
      },
      sampleNames: { type: "static", cycle: [[["bd"]]] },
      notes: { type: "static", cycle: [[[60], [60], [60]]] },
      variationIndices: { type: "static", cycle: [[[0], [1], [2]]] },
    },
  },
  {
    name: "sampler timing density ties prefer notes over names",
    instrument: "sampler",
    sampleName: "kick",
    operations: () => [
      { method: "notes", args: [[60, 64]] },
      { method: "name", args: [["bd", "sd"]] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.5 },
            { offset: 0.5, duration: 0.5 },
          ],
        ],
      },
      sampleNames: { type: "static", cycle: [[["bd"], ["sd"]]] },
      notes: { type: "static", cycle: [[[60], [64]]] },
    },
  },
  {
    name: "sampler timing density ties prefer names over variation",
    instrument: "sampler",
    sampleName: "kick",
    operations: () => [
      { method: "name", args: ["bd", "sd"] },
      { method: "variation", args: [0] },
    ],
    expected: {
      timing: {
        cycle: [[{ offset: 0, duration: 1 }], [{ offset: 0, duration: 1 }]],
        condition: undefined,
      },
      notes: undefined,
      sampleNames: { type: "static", cycle: [[["bd"]], [["sd"]]] },
      variationIndices: { type: "static", cycle: [[[0]], [[0]]] },
    },
  },
  {
    name: "constructor sample name fallback fills authored hits",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [{ method: "variation", args: [[0, 1, 2]] }],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 1 / 3 },
            { offset: 1 / 3, duration: 1 / 3 },
            { offset: 2 / 3, duration: 1 / 3 },
          ],
        ],
      },
      sampleNames: { type: "static", cycle: [[["bd"]]] },
      variationIndices: { type: "static", cycle: [[[0], [1], [2]]] },
    },
  },
  {
    name: "authored scalar sample name is distinct from constructor fallback intent",
    instrument: "sampler",
    operations: () => [
      { method: "name", args: ["bd"] },
      { method: "notes", args: [[60, 64]] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.5 },
            { offset: 0.5, duration: 0.5 },
          ],
        ],
      },
      notes: { type: "static", cycle: [[[60], [64]]] },
      sampleNames: { type: "static", cycle: [[["bd"]]] },
    },
  },
  {
    name: "constructor sample name fallback survives slowdown before explicit timing",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "slow", args: [2] },
      { method: "xox", args: [[1, 1]] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.5 },
            { offset: 0.5, duration: 0.5 },
          ],
          [],
        ],
        condition: undefined,
      },
      sampleNames: {
        type: "static",
        cycle: [[["bd"]], [["bd"]]],
      },
      notes: undefined,
      variationIndices: undefined,
    },
  },
  {
    name: "transformed default cycle supplies timing when no authored lane does",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [{ method: "slow", args: [2] }],
    expected: {
      timing: {
        cycle: [[{ offset: 0, duration: 1 }], []],
        condition: undefined,
      },
      sampleNames: { type: "static", cycle: [[["bd"]], [["bd"]]] },
      notes: undefined,
      variationIndices: undefined,
    },
  },
  {
    name: "default name and note fallbacks fill stronger timing despite transformed rest bars",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "root", args: ["a3"] },
      { method: "slow", args: [2] },
      { method: "xox", args: [new RandomCycle().bin().steps(2).chance(1)] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.5 },
            { offset: 0.5, duration: 0.5 },
          ],
          [
            { offset: 0, duration: 0.5 },
            { offset: 0.5, duration: 0.5 },
          ],
        ],
        condition: undefined,
      },
      sampleNames: { type: "static", cycle: [[["bd"]], [["bd"]]] },
      notes: {
        type: "static",
        cycle: [
          [[57], [57]],
          [[57], [57]],
        ],
      },
      variationIndices: undefined,
    },
  },
  {
    name: "authored name with the same value filters stronger timing",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "name", args: ["bd"] },
      { method: "slow", args: [2] },
      { method: "xox", args: [new RandomCycle().bin().steps(2).chance(1)] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.5 },
            { offset: 0.5, duration: 0.5 },
          ],
          [],
        ],
        condition: undefined,
      },
      sampleNames: { type: "static", cycle: [[["bd"]], [null]] },
      notes: undefined,
      variationIndices: undefined,
    },
  },
  {
    name: "authored notes equal to default filter stronger timing",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "root", args: ["a3"] },
      { method: "notes", args: [0] },
      { method: "slow", args: [2] },
      { method: "xox", args: [new RandomCycle().bin().steps(2).chance(1)] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.5 },
            { offset: 0.5, duration: 0.5 },
          ],
          [],
        ],
        condition: undefined,
      },
      sampleNames: { type: "static", cycle: [[["bd"]], [["bd"]]] },
      notes: { type: "static", cycle: [[[57], [57]], [null]] },
      variationIndices: undefined,
    },
  },
  {
    name: "authored variation equal to default filters stronger timing",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "var", args: [0] },
      { method: "slow", args: [2] },
      { method: "xox", args: [new RandomCycle().bin().steps(2).chance(1)] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.5 },
            { offset: 0.5, duration: 0.5 },
          ],
          [],
        ],
        condition: undefined,
      },
      sampleNames: { type: "static", cycle: [[["bd"]], [["bd"]]] },
      notes: undefined,
      variationIndices: { type: "static", cycle: [[[0]], [null]] },
    },
  },
  {
    name: "default fallbacks do not activate a silent explicit timing bar",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "root", args: ["a3"] },
      {
        method: "xox",
        args: [
          [0, 0],
          [1, 0],
        ],
      },
    ],
    expected: {
      timing: {
        cycle: [[], [{ offset: 0, duration: 0.5 }]],
        condition: undefined,
      },
      sampleNames: { type: "static", cycle: [[["bd"]], [["bd"]]] },
      notes: { type: "static", cycle: [[null], [[57]]] },
      variationIndices: undefined,
    },
  },
  {
    name: "authored scalar sample name filters its slowed rest bar",
    instrument: "sampler",
    operations: () => [
      { method: "name", args: ["bd"] },
      { method: "slow", args: [2] },
      { method: "xox", args: [[1, 1]] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.5 },
            { offset: 0.5, duration: 0.5 },
          ],
          [],
        ],
        condition: undefined,
      },
      sampleNames: {
        type: "static",
        cycle: [[["bd"]], [null]],
      },
      notes: undefined,
      variationIndices: undefined,
    },
  },
  {
    name: "authored scalar synth notes filter their slowed rest bar",
    instrument: "synth",
    operations: () => [
      { method: "notes", args: [60] },
      { method: "slow", args: [2] },
      { method: "xox", args: [[1, 1]] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.5 },
            { offset: 0.5, duration: 0.5 },
          ],
          [],
        ],
        condition: undefined,
      },
      notes: {
        type: "static",
        cycle: [[[60], [60]], [null]],
      },
    },
  },
  {
    name: "authored scalar variation filters its slowed rest bar",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "variation", args: [1] },
      { method: "slow", args: [2] },
      { method: "xox", args: [[1, 1]] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.5 },
            { offset: 0.5, duration: 0.5 },
          ],
          [],
        ],
        condition: undefined,
      },
      sampleNames: {
        type: "static",
        cycle: [[["bd"]], [["bd"]]],
      },
      notes: undefined,
      variationIndices: {
        type: "static",
        cycle: [[[1]], [null]],
      },
    },
  },
  {
    name: "authored scalar sampler notes filter their slowed rest bar",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "notes", args: [60] },
      { method: "slow", args: [2] },
      { method: "xox", args: [[1, 1]] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.5 },
            { offset: 0.5, duration: 0.5 },
          ],
          [],
        ],
        condition: undefined,
      },
      sampleNames: { type: "static", cycle: [[["bd"]], [["bd"]]] },
      notes: { type: "static", cycle: [[[60], [60]], [null]] },
      variationIndices: undefined,
    },
  },
  {
    name: "slow-created note rests filter every bar of replacement timing",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "notes", args: [[60, 64]] },
      { method: "slow", args: [2] },
      { method: "xox", args: [new RandomCycle().bin().steps(4).chance(1)] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.25 },
            { offset: 0.5, duration: 0.25 },
          ],
          [
            { offset: 0, duration: 0.25 },
            { offset: 0.5, duration: 0.25 },
          ],
        ],
        condition: undefined,
      },
      sampleNames: { type: "static", cycle: [[["bd"]], [["bd"]]] },
      notes: {
        type: "static",
        cycle: [
          [[60], [60]],
          [[64], [64]],
        ],
      },
      variationIndices: undefined,
    },
  },
  {
    name: "slow-created variation rests filter every bar of replacement timing",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "variation", args: [[0, 1]] },
      { method: "slow", args: [2] },
      { method: "xox", args: [new RandomCycle().bin().steps(4).chance(1)] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.25 },
            { offset: 0.5, duration: 0.25 },
          ],
          [
            { offset: 0, duration: 0.25 },
            { offset: 0.5, duration: 0.25 },
          ],
        ],
        condition: undefined,
      },
      sampleNames: { type: "static", cycle: [[["bd"]], [["bd"]]] },
      notes: undefined,
      variationIndices: { type: "static", cycle: [[[0]], [[1]]] },
    },
  },
  {
    name: "notes slowed under explicit timing filter its replacement",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "notes", args: [[60, 64]] },
      { method: "xox", args: [[1, 1, 1, 1]] },
      { method: "slow", args: [2] },
      { method: "xox", args: [new RandomCycle().bin().steps(4).chance(1)] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.25 },
            { offset: 0.5, duration: 0.25 },
          ],
          [
            { offset: 0, duration: 0.25 },
            { offset: 0.5, duration: 0.25 },
          ],
        ],
        condition: undefined,
      },
      sampleNames: { type: "static", cycle: [[["bd"]], [["bd"]]] },
      notes: {
        type: "static",
        cycle: [
          [[60], [64]],
          [[60], [64]],
        ],
      },
      variationIndices: undefined,
    },
  },
  {
    name: "variations slowed under explicit timing filter its replacement",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "variation", args: [[0, 1]] },
      { method: "xox", args: [[1, 1, 1, 1]] },
      { method: "slow", args: [2] },
      { method: "xox", args: [new RandomCycle().bin().steps(4).chance(1)] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.25 },
            { offset: 0.5, duration: 0.25 },
          ],
          [
            { offset: 0, duration: 0.25 },
            { offset: 0.5, duration: 0.25 },
          ],
        ],
        condition: undefined,
      },
      sampleNames: { type: "static", cycle: [[["bd"]], [["bd"]]] },
      notes: undefined,
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
    name: "slow-created sample-name rests filter every bar of replacement timing",
    instrument: "sampler",
    operations: () => [
      { method: "name", args: [["bd", "sd"]] },
      { method: "slow", args: [2] },
      { method: "xox", args: [new RandomCycle().bin().steps(4).chance(1)] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.25 },
            { offset: 0.5, duration: 0.25 },
          ],
          [
            { offset: 0, duration: 0.25 },
            { offset: 0.5, duration: 0.25 },
          ],
        ],
        condition: undefined,
      },
      sampleNames: { type: "static", cycle: [[["bd"]], [["sd"]]] },
      notes: undefined,
      variationIndices: undefined,
    },
  },
  {
    name: "authored one-step notes and variation repeat across fast event timing",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "notes", args: [60] },
      { method: "variation", args: [[0, 1, 2]] },
      { method: "fast", args: [2] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 1 / 6 },
            { offset: 1 / 6, duration: 1 / 6 },
            { offset: 1 / 3, duration: 1 / 6 },
            { offset: 1 / 2, duration: 1 / 6 },
            { offset: 2 / 3, duration: 1 / 6 },
            { offset: 5 * (1 / 6), duration: 1 / 6 },
          ],
        ],
        condition: undefined,
      },
      sampleNames: { type: "static", cycle: [[["bd"]]] },
      notes: {
        type: "static",
        cycle: [[[60], [60], [60], [60], [60], [60]]],
      },
      variationIndices: {
        type: "static",
        cycle: [[[0], [1], [2], [0], [1], [2]]],
      },
    },
  },
  {
    name: "note rests wrap by candidate ordinal against explicit timing",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "notes", args: [[60, null, 64]] },
      { method: "xox", args: [[1, 1, 1, 1]] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.25 },
            { offset: 0.5, duration: 0.25 },
            { offset: 0.75, duration: 0.25 },
          ],
        ],
        condition: undefined,
      },
      sampleNames: { type: "static", cycle: [[["bd"]]] },
      notes: { type: "static", cycle: [[[60], [64], [60]]] },
      variationIndices: undefined,
    },
  },
  {
    name: "variation rests wrap by candidate ordinal against explicit timing",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "variation", args: [[0, null, 2]] },
      { method: "xox", args: [[1, 1, 1, 1]] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.25 },
            { offset: 0.5, duration: 0.25 },
            { offset: 0.75, duration: 0.25 },
          ],
        ],
        condition: undefined,
      },
      sampleNames: { type: "static", cycle: [[["bd"]]] },
      notes: undefined,
      variationIndices: { type: "static", cycle: [[[0], [2]]] },
    },
  },
  {
    name: "overlapping authored rests preserve their surviving hit through reverse",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "notes", args: [[60, null, 64]] },
      { method: "variation", args: [[0, null, 2]] },
      { method: "reverse", args: [] },
    ],
    expected: {
      timing: {
        cycle: [[{ offset: 2 / 3, duration: 1 / 3 }]],
        condition: undefined,
      },
      sampleNames: { type: "static", cycle: [[["bd"]]] },
      notes: { type: "static", cycle: [[[60]]] },
      variationIndices: { type: "static", cycle: [[[0]]] },
    },
  },
  {
    name: "transformed authored note rests still filter explicit timing",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "notes", args: [[60, null, 64]] },
      { method: "xox", args: [[1, 1, 1, 1]] },
      { method: "reverse", args: [] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.25 },
            { offset: 0.25, duration: 0.25 },
            { offset: 0.75, duration: 0.25 },
          ],
        ],
        condition: undefined,
      },
      sampleNames: { type: "static", cycle: [[["bd"]]] },
      notes: { type: "static", cycle: [[[64], [60], [64]]] },
      variationIndices: undefined,
    },
  },
  {
    name: "transformed authored variation rests still filter explicit timing",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "variation", args: [[0, null, 2]] },
      { method: "xox", args: [[1, 1, 1, 1]] },
      { method: "reverse", args: [] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.25 },
            { offset: 0.25, duration: 0.25 },
            { offset: 0.75, duration: 0.25 },
          ],
        ],
        condition: undefined,
      },
      sampleNames: { type: "static", cycle: [[["bd"]]] },
      notes: undefined,
      variationIndices: { type: "static", cycle: [[[0], [2], [0]]] },
    },
  },
  {
    name: "materialized note timing gaps do not filter replacement timing",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "notes", args: [[60, 64]] },
      { method: "xox", args: [[1, 0, 1]] },
      { method: "reverse", args: [] },
      { method: "xox", args: [new RandomCycle().bin().steps(4).chance(1)] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.25 },
            { offset: 0.25, duration: 0.25 },
            { offset: 0.5, duration: 0.25 },
            { offset: 0.75, duration: 0.25 },
          ],
        ],
        condition: undefined,
      },
      sampleNames: { type: "static", cycle: [[["bd"]]] },
      notes: { type: "static", cycle: [[[64], [60], [64], [60]]] },
      variationIndices: undefined,
    },
  },
  {
    name: "materialized variation timing gaps do not filter replacement timing",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "variation", args: [[0, 2]] },
      { method: "xox", args: [[1, 0, 1]] },
      { method: "reverse", args: [] },
      { method: "xox", args: [new RandomCycle().bin().steps(4).chance(1)] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.25 },
            { offset: 0.25, duration: 0.25 },
            { offset: 0.5, duration: 0.25 },
            { offset: 0.75, duration: 0.25 },
          ],
        ],
        condition: undefined,
      },
      sampleNames: { type: "static", cycle: [[["bd"]]] },
      notes: undefined,
      variationIndices: { type: "static", cycle: [[[2], [0]]] },
    },
  },
  {
    name: "unrelated setters do not turn materialized timing gaps into rests",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "notes", args: [[60, 64]] },
      { method: "xox", args: [[1, 0, 1]] },
      { method: "reverse", args: [] },
      { method: "variation", args: [0] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 1 / 3 },
            { offset: 2 / 3, duration: 1 / 3 },
          ],
        ],
        condition: undefined,
      },
      sampleNames: { type: "static", cycle: [[["bd"]]] },
      notes: { type: "static", cycle: [[[64], [60]]] },
      variationIndices: { type: "static", cycle: [[[0]]] },
    },
  },
  {
    name: "multi-bar note rests wrap within each bar against sparse XOX candidates",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      {
        method: "notes",
        args: [
          [60, null, 64],
          [67, null],
        ],
      },
      { method: "xox", args: [[1, 0, 1, 0, 1, 0, 1, 0]] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.125 },
            { offset: 0.5, duration: 0.125 },
            { offset: 0.75, duration: 0.125 },
          ],
          [
            { offset: 0, duration: 0.125 },
            { offset: 0.5, duration: 0.125 },
          ],
        ],
        condition: undefined,
      },
      sampleNames: { type: "static", cycle: [[["bd"]], [["bd"]]] },
      notes: {
        type: "static",
        cycle: [
          [[60], [64], [60]],
          [[67], [67]],
        ],
      },
      variationIndices: undefined,
    },
  },
  {
    name: "multi-bar variation rests wrap within each bar against explicit timing",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      {
        method: "variation",
        args: [
          [0, null, 2],
          [3, null],
        ],
      },
      { method: "xox", args: [[1, 1, 1, 1]] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.25 },
            { offset: 0.5, duration: 0.25 },
            { offset: 0.75, duration: 0.25 },
          ],
          [
            { offset: 0, duration: 0.25 },
            { offset: 0.5, duration: 0.25 },
          ],
        ],
        condition: undefined,
      },
      sampleNames: { type: "static", cycle: [[["bd"]], [["bd"]]] },
      notes: undefined,
      variationIndices: {
        type: "static",
        cycle: [[[0], [2]], [[3]]],
      },
    },
  },
  {
    name: "sample-name rests already filter explicit timing by candidate ordinal",
    instrument: "sampler",
    operations: () => [
      { method: "name", args: [["bd", null, "sd"]] },
      { method: "xox", args: [[1, 1, 1, 1]] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.25 },
            { offset: 0.5, duration: 0.25 },
            { offset: 0.75, duration: 0.25 },
          ],
        ],
        condition: undefined,
      },
      sampleNames: { type: "static", cycle: [[["bd"], ["sd"]]] },
      notes: undefined,
      variationIndices: undefined,
    },
  },
  {
    name: "simultaneous duplicate voices and independent lane wrapping",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      {
        method: "notes",
        args: [
          [
            [60, 60],
            [64, 67],
          ],
        ],
      },
      { method: "variation", args: [[0, 1, 2]] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 1 / 3 },
            { offset: 1 / 3, duration: 1 / 3 },
            { offset: 2 / 3, duration: 1 / 3 },
          ],
        ],
        condition: undefined,
      },
      sampleNames: { type: "static", cycle: [[["bd"]]] },
      notes: {
        type: "static",
        cycle: [
          [
            [60, 60],
            [64, 67],
            [60, 60],
          ],
        ],
      },
      variationIndices: { type: "static", cycle: [[[0], [1], [2]]] },
    },
  },
  {
    name: "root and scale preserve negative degree pitch conversion",
    instrument: "synth",
    operations: () => [
      { method: "root", args: ["c4"] },
      { method: "scale", args: ["maj"] },
      { method: "notes", args: [[0, -1, 2]] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 1 / 3 },
            { offset: 1 / 3, duration: 1 / 3 },
            { offset: 2 / 3, duration: 1 / 3 },
          ],
        ],
      },
      notes: { type: "static", cycle: [[[60], [59], [64]]] },
    },
  },
  {
    name: "fast before a later setter preserves the setter's authored pattern",
    instrument: "synth",
    operations: () => [
      { method: "notes", args: [[60, 64]] },
      { method: "fast", args: [2] },
      { method: "notes", args: [[67, 69]] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.5 },
            { offset: 0.5, duration: 0.5 },
          ],
        ],
      },
      notes: { type: "static", cycle: [[[67], [69]]] },
    },
  },
  {
    name: "slow before a later setter preserves the setter's authored pattern",
    instrument: "synth",
    operations: () => [
      { method: "notes", args: [[60, 64]] },
      { method: "slow", args: [2] },
      { method: "notes", args: [[67, 69]] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.5 },
            { offset: 0.5, duration: 0.5 },
          ],
        ],
        condition: undefined,
      },
      notes: { type: "static", cycle: [[[67], [69]]] },
    },
  },
  {
    name: "stretch before a later setter preserves the setter's authored pattern",
    instrument: "synth",
    operations: () => [
      { method: "notes", args: [[60, 64]] },
      { method: "stretch", args: [2] },
      { method: "notes", args: [[67, 69]] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.5 },
            { offset: 0.5, duration: 0.5 },
          ],
        ],
        condition: undefined,
      },
      notes: { type: "static", cycle: [[[67], [69]]] },
    },
  },
  {
    name: "reverse before a later setter preserves the setter's authored pattern",
    instrument: "synth",
    operations: () => [
      { method: "notes", args: [[60, 64]] },
      { method: "reverse", args: [] },
      { method: "notes", args: [[67, 69]] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.5 },
            { offset: 0.5, duration: 0.5 },
          ],
        ],
        condition: undefined,
      },
      notes: { type: "static", cycle: [[[67], [69]]] },
    },
  },
  {
    name: "slow transforms ordinary authored event lanes",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "notes", args: [[60, 64]] },
      { method: "variation", args: [[0, 1]] },
      { method: "slow", args: [2] },
    ],
    expected: {
      timing: {
        cycle: [[{ offset: 0, duration: 0.5 }], [{ offset: 0, duration: 0.5 }]],
        condition: undefined,
      },
      sampleNames: { type: "static", cycle: [[["bd"]], [["bd"]]] },
      notes: { type: "static", cycle: [[[60]], [[64]]] },
      variationIndices: { type: "static", cycle: [[[0]], [[1]]] },
    },
  },
  {
    name: "stretch transforms ordinary authored event lanes",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "notes", args: [[60, 64]] },
      { method: "variation", args: [[0, 1]] },
      { method: "stretch", args: [2] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.5 },
            { offset: 0.5, duration: 0.5 },
          ],
          [
            { offset: 0, duration: 0.5 },
            { offset: 0.5, duration: 0.5 },
          ],
        ],
        condition: undefined,
      },
      sampleNames: { type: "static", cycle: [[["bd"]], [["bd"]]] },
      notes: {
        type: "static",
        cycle: [
          [[60], [64]],
          [[60], [64]],
        ],
      },
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
    name: "reverse transforms ordinary authored event lanes",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "notes", args: [[60, 64]] },
      { method: "variation", args: [[0, 1]] },
      { method: "reverse", args: [] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.5 },
            { offset: 0.5, duration: 0.5 },
          ],
        ],
        condition: undefined,
      },
      sampleNames: { type: "static", cycle: [[["bd"]]] },
      notes: { type: "static", cycle: [[[64], [60]]] },
      variationIndices: { type: "static", cycle: [[[1], [0]]] },
    },
  },
  {
    name: "all authored sampler rest lanes intersect by original candidate ordinal",
    instrument: "sampler",
    sampleName: "kick",
    operations: () => [
      { method: "notes", args: [[60, null]] },
      { method: "name", args: [["bd", null, "sd"]] },
      { method: "variation", args: [[0, null, 2, 3]] },
      { method: "xox", args: [[1, 1, 1, 1]] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.25 },
            { offset: 0.5, duration: 0.25 },
          ],
        ],
        condition: undefined,
      },
      notes: { type: "static", cycle: [[[60], [60]]] },
      sampleNames: { type: "static", cycle: [[["bd"], ["sd"]]] },
      variationIndices: { type: "static", cycle: [[[0], [2], [3]]] },
    },
  },
  {
    name: "inferred note timing is not filtered again by its own rest positions",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "notes", args: [[60, null, 64]] },
      { method: "variation", args: [[0, 1, 2, 3]] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 1 / 3 },
            { offset: 2 / 3, duration: 1 / 3 },
          ],
        ],
        condition: undefined,
      },
      sampleNames: { type: "static", cycle: [[["bd"]]] },
      notes: { type: "static", cycle: [[[60], [64]]] },
      variationIndices: { type: "static", cycle: [[[0], [1], [2], [3]]] },
    },
  },
  {
    name: "multi-bar note and variation cycles expand to their shared LCM",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      { method: "notes", args: [[60], [64, 67]] },
      { method: "variation", args: [[0], [1], [2]] },
    ],
    expected: {
      timing: {
        cycle: [
          [{ offset: 0, duration: 1 }],
          [
            { offset: 0, duration: 0.5 },
            { offset: 0.5, duration: 0.5 },
          ],
          [{ offset: 0, duration: 1 }],
          [
            { offset: 0, duration: 0.5 },
            { offset: 0.5, duration: 0.5 },
          ],
          [{ offset: 0, duration: 1 }],
          [
            { offset: 0, duration: 0.5 },
            { offset: 0.5, duration: 0.5 },
          ],
        ],
      },
      notes: {
        type: "static",
        cycle: [
          [[60]],
          [[64], [67]],
          [[60]],
          [[64], [67]],
          [[60]],
          [[64], [67]],
        ],
      },
      sampleNames: {
        type: "static",
        cycle: Array.from({ length: 6 }, () => [["bd"]]),
      },
      variationIndices: {
        type: "static",
        cycle: [[[0]], [[1]], [[2]], [[0]], [[1]], [[2]]],
      },
    },
  },
  {
    name: "random synth values retain random settings under fixed timing",
    instrument: "synth",
    operations: () => [
      {
        method: "notes",
        args: [new RandomCycle().int().range(48, 72).steps(2).ribbon(9)],
      },
      { method: "xox", args: [[1, 1, 1, 1]] },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.25 },
            { offset: 0.25, duration: 0.25 },
            { offset: 0.5, duration: 0.25 },
            { offset: 0.75, duration: 0.25 },
          ],
        ],
        condition: undefined,
      },
      notes: {
        type: "random-number",
        valuesPerBar: [4],
        dataType: "integer",
        segments: [{ seed: 9 }],
        range: { min: 48, max: 72 },
        algorithm: "xor",
        order: "forward",
      },
    },
  },
  {
    name: "random variation values retain per-bar counts and generation settings",
    instrument: "sampler",
    sampleName: "bd",
    operations: () => [
      {
        method: "variation",
        args: [new RandomCycle().int().range(0, 4).steps(2, 0).ribbon(11)],
      },
    ],
    expected: {
      timing: {
        cycle: [
          [
            { offset: 0, duration: 0.5 },
            { offset: 0.5, duration: 0.5 },
          ],
          [],
        ],
      },
      sampleNames: { type: "static", cycle: [[["bd"]], [["bd"]]] },
      variationIndices: {
        type: "random-number",
        valuesPerBar: [2, 0],
        dataType: "integer",
        segments: [{ seed: 11 }],
        range: { min: 0, max: 4 },
        algorithm: "xor",
        order: "forward",
      },
    },
  },
  {
    name: "generated chop timing remains exempt from event transforms",
    instrument: "sampler",
    sampleName: "loop",
    operations: () => [
      { method: "chop", args: [2] },
      { method: "fit", args: [4] },
      { method: "reverse", args: [] },
    ],
    expected: {
      timing: {
        cycle: [
          [{ offset: 0, duration: 2 }],
          [],
          [{ offset: 0, duration: 2 }],
          [],
        ],
        condition: undefined,
      },
      notes: undefined,
      sampleNames: {
        type: "static",
        cycle: Array.from({ length: 4 }, () => [["loop"]]),
      },
      variationIndices: undefined,
    },
  },
  {
    name: "generated fit timing remains exempt from event transforms",
    instrument: "sampler",
    sampleName: "loop",
    operations: () => [
      { method: "fit", args: [2] },
      { method: "slow", args: [2] },
    ],
    expected: {
      timing: {
        cycle: [[{ offset: 0, duration: 1 }], [{ offset: 0, duration: 1 }]],
        condition: undefined,
      },
      notes: undefined,
      sampleNames: { type: "static", cycle: [[["loop"]], [["loop"]]] },
      variationIndices: undefined,
    },
  },
] satisfies EventSchemaFixture[];

export {
  eventSchemaFixtures,
  type EventSchemaFixture,
  type EventScenarioOperation,
};
