import type { SamplerEventPattern, SynthEventPattern } from "@web-audio/schema";
import { RandomCycle } from "@web-audio/patterns";
import { describe, expect, it } from "vitest";
import Drome from "../index";
import type Sampler from "./sampler";
import type Synthesizer from "./synthesizer";

type EventSchemaFixture = {
  name: string;
  createInstrument: () => Synthesizer | Sampler;
  expected: SynthEventPattern | SamplerEventPattern;
};

// PR 2 corrected schema baseline: use these expected event patterns as the
// authority for PR 4 compiler comparisons, not pre-PR 2 legacy output.
// Intentional changes: candidate-ordinal sampler rest filtering, authored
// one-step patterns (including transformed rests), and constructor fallbacks.
const eventSchemaFixtures = [
  {
    name: "default synth timing and notes",
    createInstrument: () => new Drome().synth(),
    expected: {
      timing: { cycle: [[{ offset: 0, duration: 1 }]] },
      notes: { type: "static", cycle: [[[60]]] },
    },
  },
  {
    name: "explicit synth timing with a silent bar",
    createInstrument: () =>
      new Drome().synth().notes([60], [null], [67]).xox([1, 0, 1]),
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
    createInstrument: () =>
      new Drome()
        .sample("bd")
        .notes([60, 64])
        .name(["bd", "sd"])
        .variation([0, 2]),
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
    createInstrument: () => {
      const d = new Drome();
      return d
        .synth()
        .notes([60, 64])
        .xox(d.rand().bin().steps(2, 0).chance(0.25).ribbon(7, 8));
    },
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
    createInstrument: () =>
      new Drome().sample("kick").notes([60, null]).variation([0, 1, 2]),
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
    createInstrument: () =>
      new Drome().sample("bd").notes(60).variation([0, 1, 2]),
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
    createInstrument: () =>
      new Drome().sample("kick").notes([60, 64]).name(["bd", "sd"]),
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
    createInstrument: () =>
      new Drome().sample("kick").name("bd", "sd").variation(0),
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
    createInstrument: () => new Drome().sample("bd").variation([0, 1, 2]),
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
    createInstrument: () => new Drome().sample().name("bd").notes([60, 64]),
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
    createInstrument: () => new Drome().sample("bd").slow(2).xox([1, 1]),
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
    createInstrument: () => new Drome().sample("bd").slow(2),
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
    createInstrument: () =>
      new Drome()
        .sample("bd")
        .root("a3")
        .slow(2)
        .xox(new RandomCycle().bin().steps(2).chance(1)),
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
    createInstrument: () =>
      new Drome()
        .sample("bd")
        .name("bd")
        .slow(2)
        .xox(new RandomCycle().bin().steps(2).chance(1)),
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
    createInstrument: () =>
      new Drome()
        .sample("bd")
        .root("a3")
        .notes(0)
        .slow(2)
        .xox(new RandomCycle().bin().steps(2).chance(1)),
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
    createInstrument: () =>
      new Drome()
        .sample("bd")
        .var(0)
        .slow(2)
        .xox(new RandomCycle().bin().steps(2).chance(1)),
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
    createInstrument: () =>
      new Drome().sample("bd").root("a3").xox([0, 0], [1, 0]),
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
    createInstrument: () => new Drome().sample().name("bd").slow(2).xox([1, 1]),
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
    createInstrument: () => new Drome().synth().notes(60).slow(2).xox([1, 1]),
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
    createInstrument: () =>
      new Drome().sample("bd").variation(1).slow(2).xox([1, 1]),
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
    createInstrument: () =>
      new Drome().sample("bd").notes(60).slow(2).xox([1, 1]),
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
    name: "authored one-step notes and variation repeat across fast event timing",
    createInstrument: () =>
      new Drome().sample("bd").notes(60).variation([0, 1, 2]).fast(2),
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
    createInstrument: () =>
      new Drome().sample("bd").notes([60, null, 64]).xox([1, 1, 1, 1]),
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
    createInstrument: () =>
      new Drome().sample("bd").variation([0, null, 2]).xox([1, 1, 1, 1]),
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
    name: "multi-bar note rests wrap within each bar against sparse XOX candidates",
    createInstrument: () =>
      new Drome()
        .sample("bd")
        .notes([60, null, 64], [67, null])
        .xox([1, 0, 1, 0, 1, 0, 1, 0]),
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
    createInstrument: () =>
      new Drome()
        .sample("bd")
        .variation([0, null, 2], [3, null])
        .xox([1, 1, 1, 1]),
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
    createInstrument: () =>
      new Drome().sample().name(["bd", null, "sd"]).xox([1, 1, 1, 1]),
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
    createInstrument: () =>
      new Drome()
        .sample("bd")
        .notes([
          [60, 60],
          [64, 67],
        ])
        .variation([0, 1, 2]),
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
    createInstrument: () =>
      new Drome().synth().root("c4").scale("maj").notes([0, -1, 2]),
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
    createInstrument: () =>
      new Drome().synth().notes([60, 64]).fast(2).notes([67, 69]),
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
    createInstrument: () =>
      new Drome().synth().notes([60, 64]).slow(2).notes([67, 69]),
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
    createInstrument: () =>
      new Drome().synth().notes([60, 64]).stretch(2).notes([67, 69]),
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
    createInstrument: () =>
      new Drome().synth().notes([60, 64]).reverse().notes([67, 69]),
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
    createInstrument: () =>
      new Drome().sample("bd").notes([60, 64]).variation([0, 1]).slow(2),
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
    createInstrument: () =>
      new Drome().sample("bd").notes([60, 64]).variation([0, 1]).stretch(2),
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
    createInstrument: () =>
      new Drome().sample("bd").notes([60, 64]).variation([0, 1]).reverse(),
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
    createInstrument: () =>
      new Drome()
        .sample("kick")
        .notes([60, null])
        .name(["bd", null, "sd"])
        .variation([0, null, 2, 3])
        .xox([1, 1, 1, 1]),
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
    createInstrument: () =>
      new Drome().sample("bd").notes([60, null, 64]).variation([0, 1, 2, 3]),
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
    createInstrument: () =>
      new Drome().sample("bd").notes([60], [64, 67]).variation([0], [1], [2]),
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
    createInstrument: () => {
      const d = new Drome();
      return d
        .synth()
        .notes(d.rand().int().range(48, 72).steps(2).ribbon(9))
        .xox([1, 1, 1, 1]);
    },
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
    createInstrument: () => {
      const d = new Drome();
      return d
        .sample("bd")
        .variation(d.rand().int().range(0, 4).steps(2, 0).ribbon(11));
    },
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
    createInstrument: () => new Drome().sample("loop").chop(2).fit(4).reverse(),
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
    createInstrument: () => new Drome().sample("loop").fit(2).slow(2),
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

function toSerializableEventPattern(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function expectEventSchemaFixture({
  createInstrument,
  expected,
}: EventSchemaFixture) {
  const actual = createInstrument().getSchema().eventPattern;
  expect(toSerializableEventPattern(actual)).toStrictEqual(
    toSerializableEventPattern(expected),
  );
}

describe("event schema compatibility fixtures", () => {
  it.each(eventSchemaFixtures)("$name", expectEventSchemaFixture);
});
