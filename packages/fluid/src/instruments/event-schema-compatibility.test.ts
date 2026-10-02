import { describe, expect, it } from "vitest";
import {
  eventSchemaFixtures,
  type EventSchemaFixture,
} from "./event-schema-fixtures";
import {
  replayPublicScenario,
  toSerializableEventPattern,
} from "./event-scenario-replay";

function expectEventSchemaFixture(fixture: EventSchemaFixture) {
  const actual = replayPublicScenario(fixture, fixture.operations()).getSchema()
    .eventPattern;
  expect(toSerializableEventPattern(actual)).toStrictEqual(
    toSerializableEventPattern(fixture.expected),
  );
}

describe("event schema compatibility fixtures", () => {
  it.each(eventSchemaFixtures)("$name", expectEventSchemaFixture);
});
