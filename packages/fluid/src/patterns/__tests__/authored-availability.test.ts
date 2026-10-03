import { describe, expect, it } from "vitest";
import AuthoredAvailability from "../authored-availability";

describe("authored availability", () => {
  it("preserves rests introduced by transforms", () => {
    const availability = new AuthoredAvailability([[true, true]]).slow(2);

    expect(availability.fixedCycle).toEqual([
      [true, false],
      [true, false],
    ]);
  });

  it("removes materialized timing gaps from candidate availability", () => {
    const availability = new AuthoredAvailability([
      [true, true],
    ]).materializeAgainstTiming({
      cycle: [
        [
          { offset: 0, duration: 1 / 3 },
          { offset: 2 / 3, duration: 1 / 3 },
        ],
      ],
    });

    expect(availability.reverse().fixedCycle).toEqual([[true, true]]);
  });

  it("retains latent transformed rests until timing is replaced", () => {
    const timing = {
      cycle: [
        [
          { offset: 0, duration: 0.25 },
          { offset: 0.25, duration: 0.25 },
          { offset: 0.5, duration: 0.25 },
          { offset: 0.75, duration: 0.25 },
        ],
      ],
    };
    const availability = new AuthoredAvailability([
      [true, true],
    ]).materializeAgainstTiming(timing);

    availability.slow(2);
    expect(availability.fixedCycle).toEqual([
      [true, true],
      [true, true],
    ]);
    availability.materializeAgainstTiming({ cycle: timing.cycle.reverse() });
    availability.reverse();
    expect(availability.fixedCycle).toEqual([
      [true, true],
      [true, true],
    ]);
    expect(availability.releaseTiming().fixedCycle).toEqual([
      [false, true, false, true],
      [false, true, false, true],
    ]);
  });

  it("does not promote inherited timing gaps when releasing slowed timing", () => {
    const availability = new AuthoredAvailability([
      [true, true],
    ]).materializeAgainstTiming({
      cycle: [
        [
          { offset: 0, duration: 1 / 3 },
          { offset: 2 / 3, duration: 1 / 3 },
        ],
      ],
    });

    availability.slow(2).reverse();
    expect(availability.releaseTiming().fixedCycle).toEqual([
      [false, true, false],
      [false, true],
    ]);
  });

  it("retains authored rests through an empty timing bar", () => {
    const availability = new AuthoredAvailability([
      [true, false],
    ]).materializeAgainstTiming({ cycle: [[]] });

    expect(availability.reverse().fixedCycle).toEqual([[false, true]]);
  });

  it("retains authored rests while materializing against timing", () => {
    const availability = new AuthoredAvailability([
      [true, false, true],
    ]).materializeAgainstTiming({
      cycle: [
        [
          { offset: 0, duration: 0.25 },
          { offset: 0.25, duration: 0.25 },
          { offset: 0.5, duration: 0.25 },
          { offset: 0.75, duration: 0.25 },
        ],
      ],
    });

    expect(availability.reverse().fixedCycle).toEqual([
      [true, true, false, true],
    ]);
  });
});
