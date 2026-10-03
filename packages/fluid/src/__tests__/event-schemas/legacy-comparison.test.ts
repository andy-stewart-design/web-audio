// Temporary independent legacy oracle; remove at cutover, retaining shared
// fixtures and explicit native regressions instead of obsolete implementations.
import { RandomCycle } from "@web-audio/patterns";
import { describe, expect, it } from "vitest";
import type {
  EventScenarioOperation,
  EventSchemaFixture,
} from "./support/schema-fixtures";
import {
  approvedExceptionScenarios,
  feasibilityScenarios,
} from "./support/native-regression-fixtures";
import {
  applyNativeOperation,
  applyPublicOperation,
  compileNativeScenario,
  createNativeScenario,
  createPublicScenario,
  describeOperations,
  replayNativeScenario,
  replayPublicScenario,
  toSerializableEventPattern,
  type NativeScenario,
} from "./support/scenario-replay";

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

const hit = (offset: number, duration: number) => ({ offset, duration });
const bar = (offsets: number[], duration: number) =>
  offsets.map((offset) => hit(offset, duration));
const names = (count: number, values = ["bd"]) =>
  ({
    type: "static",
    cycle: Array.from({ length: count }, () => values.map((value) => [value])),
  }) as const;
const variation = {
  type: "random-number",
  valuesPerBar: [2, 0],
  dataType: "integer",
  segments: [{ seed: 11 }],
  range: { min: -1, max: 4 },
  algorithm: "xor",
  order: "forward",
} as const;

type LegacyExceptionFamily = {
  kind: "synth" | "sampler";
  seed: number;
  reason: string;
  native: (typeof approvedExceptionScenarios)[number];
  prefixes: { length: number; expected: EventSchemaFixture["expected"] }[];
};

// Exact counterpart schemas, not broad exemptions for any sequence containing
// a speed or rest. Each affected prefix must still match a retained, explicit
// native expectation AND this independently characterized legacy expectation.
const legacyExceptionFamilies = [
  {
    kind: "synth",
    seed: 6,
    reason: "approved immediate implicit speed transforms",
    native: approvedExceptionScenarios[0],
    prefixes: [
      {
        length: 6,
        expected: {
          timing: { cycle: [bar([0, 0.5, 0.75], 0.25)] },
          notes: { type: "static", cycle: [[[120], [124], [120]]] },
        },
      },
      {
        length: 7,
        expected: {
          timing: { cycle: [bar([0, 0.5, 0.75], 0.25)] },
          notes: { type: "static", cycle: [[[120], [124], [120]]] },
        },
      },
      {
        length: 8,
        expected: {
          timing: {
            cycle: [
              bar([0, 0.125, 0.5, 0.625, 0.75, 0.875], 0.125),
              bar([0, 0.125, 0.5, 0.625, 0.75, 0.875], 0.125),
            ],
          },
          notes: {
            type: "static",
            cycle: [
              [[120], [120], [124], [124], [120], [120]],
              [[120], [120], [124], [124], [120], [120]],
            ],
          },
        },
      },
    ],
  },
  {
    kind: "synth",
    seed: 12,
    reason: "approved immediate implicit speed transforms",
    native: approvedExceptionScenarios[1],
    prefixes: [
      {
        length: 6,
        expected: {
          timing: { cycle: [bar([0, 2 / 3], 1 / 3), bar([0, 2 / 3], 1 / 3)] },
          notes: {
            type: "static",
            cycle: [
              [[0], [0]],
              [[0], [0]],
            ],
          },
        },
      },
      {
        length: 7,
        expected: {
          timing: { cycle: [bar([0, 1 / 3, 0.5, 5 * (1 / 6)], 1 / 6)] },
          notes: { type: "static", cycle: [[[0], [0], [0], [0]]] },
        },
      },
      {
        length: 8,
        expected: {
          timing: { cycle: [bar([0, 0.5, 0.75], 0.25)] },
          notes: { type: "static", cycle: [[[0], [0], [0]]] },
        },
      },
    ],
  },
  {
    kind: "synth",
    seed: 26,
    reason: "approved synth materialized slowdown-rest filtering",
    native: approvedExceptionScenarios[2],
    prefixes: [
      {
        length: 8,
        expected: {
          timing: { cycle: [[hit(0, 1 / 3)], [hit(2 / 3, 1 / 3)], [], []] },
          notes: {
            type: "static",
            cycle: [[[120, 120]], [[120, 120]], [null], [null]],
          },
        },
      },
    ],
  },
  {
    kind: "sampler",
    seed: 48,
    reason: "approved immediate implicit speed transforms",
    native: approvedExceptionScenarios[3],
    prefixes: [
      {
        length: 5,
        expected: {
          timing: { cycle: [bar([0, 0.25, 0.5, 0.75], 0.25)] },
          sampleNames: names(1),
          notes: {
            type: "static",
            cycle: [
              [
                [103, 103],
                [110, 115],
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
          timing: { cycle: [bar([0, 0.25, 0.5, 0.75], 0.25), []] },
          sampleNames: names(2),
          notes: {
            type: "static",
            cycle: [
              [
                [103, 103],
                [110, 115],
                [103, 103],
                [110, 115],
              ],
              [null],
            ],
          },
          variationIndices: {
            ...variation,
            valuesPerBar: [2, 0],
            segments: [{ seed: 11 }],
          },
        },
      },
      {
        length: 7,
        expected: {
          timing: { cycle: [bar([0, 0.5, 0.75], 0.25), []] },
          sampleNames: names(2, ["bd", "sd"]),
          notes: {
            type: "static",
            cycle: [
              [
                [103, 103],
                [110, 115],
                [103, 103],
              ],
              [null],
            ],
          },
          variationIndices: {
            ...variation,
            valuesPerBar: [2, 0],
            segments: [{ seed: 11 }],
          },
        },
      },
      {
        length: 8,
        expected: {
          timing: { cycle: [bar([0, 0.5, 0.75], 0.25), []] },
          sampleNames: names(2, ["bd", "sd"]),
          notes: { type: "static", cycle: [[[0], [0], [0]], [null]] },
          variationIndices: {
            ...variation,
            valuesPerBar: [2, 0],
            segments: [{ seed: 11 }],
          },
        },
      },
    ],
  },
] satisfies LegacyExceptionFamily[];

function expectComparison(
  actual: unknown,
  legacy: unknown,
  kind: "synth" | "sampler" | "generated",
  seed: number,
  operations: EventScenarioOperation[],
  message: string,
) {
  const family = legacyExceptionFamilies.find(
    (entry) => entry.kind === kind && entry.seed === seed,
  );
  const counterpart = family?.prefixes.find(
    (prefix) => prefix.length === operations.length,
  );
  if (!family || !counterpart) {
    expect(actual, message).toStrictEqual(toSerializableEventPattern(legacy));
    return;
  }
  const native = family.native.prefixes.find(
    (prefix) => prefix.length === operations.length,
  );
  expect(native, message).toBeDefined();
  expect(describeOperations(operations), message).toBe(
    describeOperations(family.native.operations().slice(0, operations.length)),
  );
  const reason = `${family.reason}: ${message}`;
  expect(actual, reason).toStrictEqual(
    toSerializableEventPattern(native?.expected),
  );
  expect(toSerializableEventPattern(legacy), reason).toStrictEqual(
    toSerializableEventPattern(counterpart.expected),
  );
}

it("characterizes the approved synth slowdown-rest exception without changing old goldens", () => {
  const fixture = feasibilityScenarios.find(
    (scenario) =>
      scenario.name ===
      "synth slowdown rests filter replacement timing by candidate ordinal",
  );
  if (!fixture) throw new Error("Missing retained slowdown-rest regression");
  expect(
    toSerializableEventPattern(
      compileNativeScenario(
        replayNativeScenario(fixture, fixture.operations()),
      ),
    ),
  ).toStrictEqual(toSerializableEventPattern(fixture.expected));
  expect(
    toSerializableEventPattern(
      replayPublicScenario(fixture, fixture.operations()).getSchema()
        .eventPattern,
    ),
  ).toStrictEqual({
    timing: {
      cycle: [bar([0, 0.25, 0.5, 0.75], 0.25), bar([0, 0.25, 0.5, 0.75], 0.25)],
    },
    notes: {
      type: "static",
      cycle: [
        [[60], [60], [60], [60]],
        [[64], [64], [64], [64]],
      ],
    },
  });
});

describe("temporary fractional empty-note materialization comparisons", () => {
  it.each(
    feasibilityScenarios.filter((fixture) =>
      fixture.name.includes(
        "retain materialized timing width through fractional",
      ),
    ),
  )("$name", (fixture) => {
    for (const intermediateReads of [false, true]) {
      const operations = fixture.operations();
      let native = createNativeScenario(fixture);
      let legacy = createPublicScenario(fixture);
      for (let index = 0; index < operations.length; index++) {
        native = applyNativeOperation(native, operations[index]);
        legacy = applyPublicOperation(legacy, operations[index]);
        const final = index === operations.length - 1;
        if (!intermediateReads && !final) continue;
        const actual = toSerializableEventPattern(
          compileNativeScenario(native),
        );
        const message = `${fixture.name}, intermediateReads=${intermediateReads}, ${describeOperations(operations.slice(0, index + 1))}`;
        expect(actual, message).toStrictEqual(
          toSerializableEventPattern(legacy.getSchema().eventPattern),
        );
        if (final)
          expect(actual, message).toStrictEqual(
            toSerializableEventPattern(fixture.expected),
          );
      }
    }
  });
});

for (const kind of ["synth", "sampler", "generated"] as const) {
  const input = {
    instrument: kind === "synth" ? ("synth" as const) : ("sampler" as const),
    sampleName: "bd",
  };
  describe(`temporary complete-schema ${kind} comparisons`, () => {
    it.each(Array.from({ length: 48 }, (_, index) => index + 1))(
      "replays seed %i with and without intermediate compilation",
      (seed) => {
        const nativeOperations = generateOperations(seed, kind);
        const legacyOperations = generateOperations(seed, kind);
        let native: NativeScenario = createNativeScenario(input);
        let legacy = createPublicScenario(input);
        for (let index = 0; index < nativeOperations.length; index++) {
          native = applyNativeOperation(native, nativeOperations[index]);
          legacy = applyPublicOperation(legacy, legacyOperations[index]);
          const prefix = nativeOperations.slice(0, index + 1);
          const message = `${kind}, seed=${seed}, prefix=${describeOperations(prefix)}`;
          const actual = toSerializableEventPattern(
            compileNativeScenario(native),
          );
          expectComparison(
            actual,
            legacy.getSchema().eventPattern,
            kind,
            seed,
            prefix,
            `materialized legacy prefixes: ${message}`,
          );
          // Reinitialize both paths for uninterrupted prefix replay. No legacy
          // getter or native compiler participates in authoring this sequence.
          const uninterrupted = replayNativeScenario(
            input,
            generateOperations(seed, kind).slice(0, index + 1),
          );
          expect(
            toSerializableEventPattern(compileNativeScenario(uninterrupted)),
            `native read independence: ${message}`,
          ).toStrictEqual(actual);
          const legacyUninterrupted = replayPublicScenario(
            input,
            generateOperations(seed, kind).slice(0, index + 1),
          ).getSchema().eventPattern;
          expectComparison(
            actual,
            legacyUninterrupted,
            kind,
            seed,
            prefix,
            `uninterrupted legacy prefixes: ${message}`,
          );
        }
      },
    );
  });
}
