import { describe, expect, it } from "vitest";
import { MaskedCycle } from "./masked-cycle";

describe("MaskedCycle", () => {
  it("keeps unmasked source content without a trigger grid", () => {
    const cycle = new MaskedCycle([
      [60, 64],
      [67, 71],
    ]);

    expect(cycle.source).toEqual([
      [60, 64],
      [67, 71],
    ]);
    expect(cycle.mask).toBeUndefined();
    expect(cycle.activeEvents).toEqual([
      [60, 64],
      [67, 71],
    ]);
  });

  it("keeps source content separate while cycling it across active mask positions", () => {
    const cycle = new MaskedCycle([[60, 64]]).setMask([[1, 0, 1, 1]]);

    expect(cycle.source).toEqual([[60, 64]]);
    expect(cycle.mask).toEqual([[1, 0, 1, 1]]);
    expect(cycle.activeEvents).toEqual([[60, 64, 60]]);
  });

  it("repeats source and mask bars to form the final event cycle", () => {
    const cycle = new MaskedCycle([[60], [64, 67]]).setMask([
      [1, 0],
      [0, 1, 1],
      [1],
    ]);

    expect(cycle.activeEvents).toEqual([[60], [64, 67], [60]]);
  });

  it("represents empty and all-rest mask bars without source events", () => {
    const cycle = new MaskedCycle([[60, 64]]).setMask([[], [0, 0, 0]]);

    expect(cycle.mask).toEqual([[], [0, 0, 0]]);
    expect(cycle.activeEvents).toEqual([[], []]);
  });
});
