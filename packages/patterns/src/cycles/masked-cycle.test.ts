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
      expect(cycle.fixedRestFilter, name).toEqual(mask);
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

    expect(before.fixedRestFilter).toEqual([[1, 0, 0, 1]]);
    expect(before.activeEvents).toEqual([[60, 64]]);
    expect(after.fixedRestFilter).toEqual([[1, 0, 0, 0]]);
    expect(after.activeEvents).toEqual([[60]]);
    expect(hexCycle.fixedRestFilter).toEqual([[1, 0, 0, 0]]);
    expect(hexCycle.activeEvents).toEqual([[60]]);
    expect(sequenceCycle.fixedRestFilter).toEqual([
      [1, 0, 0, 0],
      [0, 0, 1, 0],
    ]);
    expect(sequenceCycle.activeEvents).toEqual([[60], [60]]);
  });

  describe("target-facing accessors", () => {
    it("returns authored source values without exposing mutable bar arrays", () => {
      const input = [[60, 64]];
      const cycle = new MaskedCycle(input);

      input[0][0] = 99;
      const values = cycle.sourceValues;
      values[0][1] = 99;

      expect(cycle.sourceValues).toEqual([[60, 64]]);
    });

    it("exposes candidate timing, fixed rests, and aligned source references", () => {
      const cycle = new MaskedCycle([[60, 64]]).setMask([[1, 0, 1, 1]]);

      expect(cycle.candidateTiming).toEqual({
        cycle: [
          [
            { offset: 0, duration: 0.25 },
            { offset: 0.5, duration: 0.25 },
            { offset: 0.75, duration: 0.25 },
          ],
        ],
      });
      expect(cycle.fixedRestFilter).toEqual([[1, 0, 1, 1]]);
      expect(cycle.activeSourceReferences).toEqual([
        [
          { sourceBarIndex: 0, sourceHitIndex: 0 },
          { sourceBarIndex: 0, sourceHitIndex: 1 },
          { sourceBarIndex: 0, sourceHitIndex: 0 },
        ],
      ]);
    });

    it("keeps source references aligned across repeated source and mask bars", () => {
      const cycle = new MaskedCycle([[60], [64, 67]]).setMask([
        [1, 0],
        [0, 1, 1],
        [1],
      ]);

      expect(cycle.activeSourceReferences).toEqual([
        [{ sourceBarIndex: 0, sourceHitIndex: 0 }],
        [
          { sourceBarIndex: 1, sourceHitIndex: 0 },
          { sourceBarIndex: 1, sourceHitIndex: 1 },
        ],
        [{ sourceBarIndex: 0, sourceHitIndex: 0 }],
      ]);
      expect(cycle.candidateTiming.cycle).toEqual([
        [{ offset: 0, duration: 0.5 }],
        [
          { offset: 1 / 3, duration: 1 / 3 },
          { offset: 2 / 3, duration: 1 / 3 },
        ],
        [{ offset: 0, duration: 1 }],
      ]);
    });

    it("keeps empty bars explicit and safely treats unmatched triggers as rests", () => {
      const cycle = new MaskedCycle<number>([[]]).setMask([[1, 0]]);

      expect(cycle.sourceValues).toEqual([[]]);
      expect(cycle.fixedRestFilter).toEqual([[0, 0]]);
      expect(cycle.activeSourceReferences).toEqual([[]]);
      expect(cycle.candidateTiming).toEqual({ cycle: [[]] });
    });

    it("keeps duplicate chord voices grouped behind one timing hit", () => {
      const cycle = new MaskedCycle([[[60, 60, 64]]]);

      expect(cycle.sourceValues).toEqual([[[60, 60, 64]]]);
      expect(cycle.activeSourceReferences).toEqual([
        [{ sourceBarIndex: 0, sourceHitIndex: 0 }],
      ]);
      expect(cycle.candidateTiming).toEqual({
        cycle: [[{ offset: 0, duration: 1 }]],
      });
    });

    it("returns accessor snapshots independently", () => {
      const cycle = new MaskedCycle([[60]]).xox([1, 0]);
      const filter = cycle.fixedRestFilter;
      const references = cycle.activeSourceReferences;
      const timing = cycle.candidateTiming;

      filter[0][0] = 0;
      references[0][0].sourceHitIndex = 99;
      timing.cycle[0][0].offset = 0.5;

      expect(cycle.fixedRestFilter).toEqual([[1, 0]]);
      expect(cycle.activeSourceReferences).toEqual([
        [{ sourceBarIndex: 0, sourceHitIndex: 0 }],
      ]);
      expect(cycle.candidateTiming).toEqual({
        cycle: [[{ offset: 0, duration: 0.5 }]],
      });
    });
  });
});
