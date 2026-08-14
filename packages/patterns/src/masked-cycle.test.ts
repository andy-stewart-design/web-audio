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

  it("omits a mask when its grid has no rests", () => {
    const cycle = new MaskedCycle([[60, 64]]).setMask([[1, 1, 1]]);

    expect(cycle.mask).toBeUndefined();
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

  it("preserves the characterized modifier behavior after xox", () => {
    const fixtures = [
      {
        name: "fast",
        cycle: new MaskedCycle([[60, 64]]).xox([1, 0, 1]).fast(2),
        mask: [[1, 0, 1, 1, 0, 1]],
        events: [[60, 64, 60, 64]],
      },
      {
        name: "slow",
        cycle: new MaskedCycle([[60, 64]]).xox([1, 0, 1, 1]).slow(2),
        mask: [
          [1, 0, 0, 0],
          [1, 0, 1, 0],
        ],
        events: [[60], [64, 60]],
      },
      {
        name: "reverse",
        cycle: new MaskedCycle([[60, 64]]).xox([1, 0, 1]).reverse(),
        mask: [[1, 0, 1]],
        events: [[64, 60]],
      },
      {
        name: "stretch",
        cycle: new MaskedCycle([[60, 64]]).xox([1, 0, 1]).stretch(2, 2),
        mask: [
          [1, 1, 0, 0, 1, 1],
          [1, 1, 0, 0, 1, 1],
        ],
        events: [
          [60, 60, 64, 64],
          [60, 60, 64, 64],
        ],
      },
    ];

    for (const { name, cycle, mask, events } of fixtures) {
      expect(cycle.mask, name).toEqual(mask);
      expect(cycle.activeEvents, name).toEqual(events);
    }
  });

  it("preserves order-sensitive rhythm modifiers around xox", () => {
    const before = new MaskedCycle([[60, 64]]).euclid(2, 4).xox([1, 0, 1, 1]);
    const after = new MaskedCycle([[60, 64]]).xox([1, 0, 1, 1]).euclid(2, 4);
    const hexCycle = new MaskedCycle([[60, 64]]).xox([1, 0, 1, 1]).hex("a");
    const sequenceCycle = new MaskedCycle([[60, 64]])
      .xox([1, 0, 1, 1])
      .sequence(4, 0, 2);

    expect(before.mask).toEqual([[1, 0, 0, 1]]);
    expect(before.activeEvents).toEqual([[60, 64]]);
    expect(after.mask).toEqual([[1, 0, 0, 0]]);
    expect(after.activeEvents).toEqual([[60]]);
    expect(hexCycle.mask).toEqual([[1, 0, 0, 0]]);
    expect(hexCycle.activeEvents).toEqual([[60]]);
    expect(sequenceCycle.mask).toEqual([
      [1, 0, 0, 0],
      [0, 0, 1, 0],
    ]);
    expect(sequenceCycle.activeEvents).toEqual([[60], [60]]);
  });
});
