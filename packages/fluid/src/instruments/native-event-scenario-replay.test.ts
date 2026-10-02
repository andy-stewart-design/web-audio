import { describe, expect, it } from "vitest";
import {
  eventSchemaFixtures,
  type EventSchemaFixture,
} from "./event-schema-fixtures";
import {
  approvedExceptionScenarios,
  feasibilityScenarios,
  immediateSpeedScenarios,
  placeholderOperations,
} from "./native-event-regression-fixtures";
import {
  applyNativeOperation,
  compileNativeScenario,
  createNativeScenario,
  describeOperations,
  replayNativeScenario,
  toSerializableEventPattern,
  type NativeScenario,
} from "./event-scenario-replay";

function assertFrozen(value: unknown) {
  if (value === null || typeof value !== "object") return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) assertFrozen(child);
}

function expectReplay(fixture: EventSchemaFixture) {
  const operations = fixture.operations();
  const message = `${fixture.name}: ${describeOperations(operations)}`;
  let observed: NativeScenario = createNativeScenario(fixture);
  for (const operation of operations) {
    observed = applyNativeOperation(observed, operation);
    const before = toSerializableEventPattern(observed.state);
    const first = compileNativeScenario(observed);
    const second = compileNativeScenario(observed);
    expect(second, message).toStrictEqual(first);
    expect(toSerializableEventPattern(observed.state), message).toStrictEqual(
      before,
    );
    assertFrozen(observed.state);
  }
  const uninterrupted = replayNativeScenario(fixture, fixture.operations());
  const actual = toSerializableEventPattern(
    compileNativeScenario(uninterrupted),
  );
  expect(actual, message).toStrictEqual(
    toSerializableEventPattern(fixture.expected),
  );
  expect(
    toSerializableEventPattern(compileNativeScenario(observed)),
    `read independence: ${message}`,
  ).toStrictEqual(actual);
}

describe("complete native event schema replay", () => {
  it.each(eventSchemaFixtures)("$name", expectReplay);
});

describe("complete representation-feasibility replay", () => {
  it.each(feasibilityScenarios)("$name", expectReplay);

  it.each([null, undefined, [], [null, undefined]])(
    "structured note placeholder %j remains a materialized value slot, never an empty group",
    (placeholder) => {
      expectReplay({
        name: "structured rest slots survive reverse",
        instrument: "synth",
        operations: () => placeholderOperations(placeholder),
        expected: {
          timing: { cycle: [[{ offset: 2 / 3, duration: 1 / 3 }]] },
          notes: { type: "static", cycle: [[[60]]] },
        },
      });
    },
  );
});

describe("approved compatibility exception replay", () => {
  it.each(immediateSpeedScenarios)("$name", expectReplay);

  for (const scenario of approvedExceptionScenarios) {
    for (const prefix of scenario.prefixes) {
      it(`${scenario.name} (prefix ${prefix.length})`, () => {
        expectReplay({
          ...scenario,
          operations: () => scenario.operations().slice(0, prefix.length),
          expected: prefix.expected,
        });
      });
    }
  }
});
