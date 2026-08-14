import { describe, expect, it } from "vitest";
import { getChordStaticSchema } from "./chord-static-schema";

describe("getChordStaticSchema", () => {
  it("serializes chord values and step geometry", () => {
    const schema = getChordStaticSchema([[[60], [64]]]);

    expect(schema).toMatchObject({ type: "static", polyphonic: true });
    expect(schema.cycle[0]).toEqual([
      { value: 60, offset: 0, duration: 0.5, stepIndex: 0 },
      { value: 64, offset: 0.5, duration: 0.5, stepIndex: 1 },
    ]);
  });

  it("transforms values without changing the input cycle", () => {
    const cycle = [[[60, 64]]];

    expect(getChordStaticSchema(cycle, (value) => value + 12).cycle[0]).toEqual(
      [
        { value: 72, offset: 0, duration: 1, stepIndex: 0 },
        { value: 76, offset: 0, duration: 1, stepIndex: 0 },
      ],
    );
    expect(cycle).toEqual([[[60, 64]]]);
  });

  it("omits null chord steps while retaining their timing positions", () => {
    const schema = getChordStaticSchema([[[60], null]]);

    expect(schema.cycle[0]).toEqual([
      { value: 60, offset: 0, duration: 0.5, stepIndex: 0 },
    ]);
  });
});
