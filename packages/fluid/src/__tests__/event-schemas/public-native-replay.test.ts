import { describe, expect, it } from "vitest";
import {
  eventSchemaFixtures,
  type EventSchemaFixture,
} from "./support/schema-fixtures";
import {
  approvedExceptionScenarios,
  feasibilityScenarios,
  immediateSpeedScenarios,
  placeholderOperations,
} from "./support/native-regression-fixtures";
import {
  applyNativeOperation,
  applyPublicOperation,
  compileNativeScenario,
  createNativeScenario,
  createPublicScenario,
  describeOperations,
  replayPublicScenario,
  toSerializableEventPattern,
} from "./support/scenario-replay";
import { generateOperations } from "./support/generated-scenarios";

function expectPublicReplay(fixture: EventSchemaFixture) {
  const operations = fixture.operations();
  const message = `${fixture.name}: ${describeOperations(operations)}`;
  let observed = createPublicScenario(fixture);
  for (const operation of operations) {
    observed = applyPublicOperation(observed, operation);
    const first = observed.getSchema();
    expect(observed.getSchema(), message).toStrictEqual(first);
  }
  const uninterrupted = replayPublicScenario(fixture, fixture.operations());
  const actual = toSerializableEventPattern(
    uninterrupted.getSchema().eventPattern,
  );
  expect(actual, message).toStrictEqual(
    toSerializableEventPattern(fixture.expected),
  );
  expect(
    toSerializableEventPattern(observed.getSchema().eventPattern),
    `public read independence: ${message}`,
  ).toStrictEqual(actual);
}

for (const kind of ["synth", "sampler", "generated"] as const) {
  describe(`generated native/public ${kind} replay`, () => {
    it.each(Array.from({ length: 48 }, (_, index) => index + 1))(
      "replays seed %i with read-independent operation prefixes",
      (seed) => {
        const input = {
          instrument:
            kind === "synth" ? ("synth" as const) : ("sampler" as const),
          sampleName: "bd",
        };
        const nativeOperations = generateOperations(seed, kind);
        const publicOperations = generateOperations(seed, kind);
        let native = createNativeScenario(input);
        let observed = createPublicScenario(input);
        for (let index = 0; index < nativeOperations.length; index++) {
          native = applyNativeOperation(native, nativeOperations[index]);
          observed = applyPublicOperation(observed, publicOperations[index]);
          const message = `${kind}, seed=${seed}, prefix=${describeOperations(publicOperations.slice(0, index + 1))}`;
          const expected = toSerializableEventPattern(
            compileNativeScenario(native),
          );
          const actual = observed.getSchema();
          expect(
            toSerializableEventPattern(actual.eventPattern),
            message,
          ).toStrictEqual(expected);
          expect(observed.getSchema(), message).toStrictEqual(actual);
          const uninterrupted = replayPublicScenario(
            input,
            generateOperations(seed, kind).slice(0, index + 1),
          );
          expect(
            uninterrupted.getSchema(),
            `public read independence: ${message}`,
          ).toStrictEqual(actual);
        }
      },
    );
  });
}

describe("native-backed public event schema replay", () => {
  it.each(eventSchemaFixtures)("$name", expectPublicReplay);
  it.each(feasibilityScenarios)("$name", expectPublicReplay);
  it.each(immediateSpeedScenarios)("$name", expectPublicReplay);

  it.each([null, undefined, [], [null, undefined]])(
    "public structured note placeholder %j preserves materialized value slots",
    (placeholder) =>
      expectPublicReplay({
        name: "public structured rest slots survive reverse",
        instrument: "synth",
        operations: () => placeholderOperations(placeholder),
        expected: {
          timing: { cycle: [[{ offset: 2 / 3, duration: 1 / 3 }]] },
          notes: { type: "static", cycle: [[[60]]] },
        },
      }),
  );

  for (const scenario of approvedExceptionScenarios) {
    for (const prefix of scenario.prefixes) {
      it(`${scenario.name} (public prefix ${prefix.length})`, () => {
        expectPublicReplay({
          ...scenario,
          operations: () => scenario.operations().slice(0, prefix.length),
          expected: prefix.expected,
        });
      });
    }
  }
});
