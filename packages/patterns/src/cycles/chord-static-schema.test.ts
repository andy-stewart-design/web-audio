import { describe, expect, it } from "vitest";
import { getChordStaticSchema } from "./chord-static-schema";

describe("getChordStaticSchema", () => {
  it("serializes monophonic and chord hits as grouped note values", () => {
    expect(getChordStaticSchema([[[60], [64, 67]]])).toEqual({
      type: "static",
      cycle: [[[60], [64, 67]]],
    });
  });

  it("preserves voice order within each chord", () => {
    expect(getChordStaticSchema([[[67, 60, 64]]]).cycle[0]).toEqual([
      [67, 60, 64],
    ]);
  });

  it("transforms values without changing the input cycle", () => {
    const cycle = [[[60, 64]]];

    expect(getChordStaticSchema(cycle, (value) => value + 12).cycle[0]).toEqual(
      [[72, 76]],
    );
    expect(cycle).toEqual([[[60, 64]]]);
  });

  it("omits rest hits from bars that contain notes", () => {
    expect(getChordStaticSchema([[[60], null]]).cycle[0]).toEqual([[60]]);
  });

  it("represents a completely silent bar with one null value", () => {
    expect(getChordStaticSchema([[null, undefined]]).cycle[0]).toEqual([null]);
  });
});
