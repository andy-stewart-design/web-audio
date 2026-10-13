import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DuckAutomation,
  MIN_DUCK_RAMP,
  depthToGain,
  type DuckRequest,
} from "../duck-automation";

class FakeAudioParam {
  value = 1;
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
  cancelAndHoldAtTime = vi.fn();
}

function request(overrides: Partial<DuckRequest> = {}): DuckRequest {
  return {
    depth: 0.25,
    onset: 0.2,
    recovery: 0.5,
    duration: 0.5,
    startTime: 10,
    ...overrides,
  };
}

function createAutomation() {
  const target = new FakeAudioParam();
  const ctx = { currentTime: 0 } as BaseAudioContext;
  return {
    target,
    automation: new DuckAutomation(ctx, target as unknown as AudioParam),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("DuckAutomation", () => {
  it("maps depth through the square-root curve with a positive floor", () => {
    expect(depthToGain(0)).toBe(1);
    expect(depthToGain(0.25)).toBe(0.5);
    expect(depthToGain(1)).toBe(0.01);
  });

  it("schedules a 0.5-second duck with immediate proportional recovery", () => {
    const { target, automation } = createAutomation();

    automation.schedule(request());

    expect(target.setValueAtTime).toHaveBeenCalledWith(1, 10);
    expect(target.linearRampToValueAtTime.mock.calls[0][0]).toBe(0.5);
    expect(target.linearRampToValueAtTime.mock.calls[0][1]).toBeCloseTo(10.1);
    expect(target.linearRampToValueAtTime.mock.calls[1]).toEqual([1, 10.35]);
    expect(target.cancelAndHoldAtTime).not.toHaveBeenCalled();
  });

  it("uses the minimum ramp for zero onset and recovery", () => {
    const { target, automation } = createAutomation();

    automation.schedule(
      request({ onset: 0, recovery: 0, duration: 0.5, startTime: 2 }),
    );

    expect(target.linearRampToValueAtTime.mock.calls[0]).toEqual([
      0.5,
      2 + MIN_DUCK_RAMP,
    ]);
    expect(target.linearRampToValueAtTime.mock.calls[1][0]).toBe(1);
    expect(target.linearRampToValueAtTime.mock.calls[1][1]).toBeCloseTo(
      2 + MIN_DUCK_RAMP * 2,
    );
  });

  it("treats depth zero as a no-op", () => {
    const { target, automation } = createAutomation();

    automation.schedule(request({ depth: 0 }));

    expect(target.setValueAtTime).not.toHaveBeenCalled();
    expect(target.linearRampToValueAtTime).not.toHaveBeenCalled();
    expect(target.cancelAndHoldAtTime).not.toHaveBeenCalled();
  });

  it("holds and replaces automation for onset, recovery, and cross-bar retriggers", () => {
    const { target, automation } = createAutomation();

    automation.schedule(request({ startTime: 1, duration: 1 }));
    automation.schedule(
      request({ depth: 1, onset: 0.1, recovery: 0.5, startTime: 1.1 }),
    );
    automation.schedule(
      request({ depth: 0.5, onset: 0.2, recovery: 0.25, startTime: 2 }),
    );

    expect(target.cancelAndHoldAtTime.mock.calls).toEqual([[1.1], [2]]);
    expect(target.setValueAtTime.mock.calls[0]).toEqual([1, 1]);
    expect(target.setValueAtTime.mock.calls[1][0]).toBeCloseTo(0.75);
    expect(target.setValueAtTime.mock.calls[1][1]).toBe(1.1);
    expect(target.setValueAtTime.mock.calls[2]).toEqual([1, 2]);
    const ramps = target.linearRampToValueAtTime.mock.calls;
    expect(ramps[0]).toEqual([0.5, 1.2]);
    expect(ramps[1]).toEqual([1, 1.7]);
    expect(ramps[2][0]).toBe(0.01);
    expect(ramps[2][1]).toBeCloseTo(1.15);
    expect(ramps[3][0]).toBe(1);
    expect(ramps[3][1]).toBeCloseTo(1.4);
    expect(ramps[4]).toEqual([1 - Math.sqrt(0.5), 2.1]);
    expect(ramps[5][0]).toBe(1);
    expect(ramps[5][1]).toBeCloseTo(2.225);
  });

  it("does not lift the bus for a shallower retrigger during onset", () => {
    const { target, automation } = createAutomation();

    automation.schedule(request({ depth: 0.25, onset: 1, duration: 1 }));
    automation.schedule(
      request({ depth: 0.01, onset: 1, duration: 1, startTime: 10.1 }),
    );

    const heldValue = target.setValueAtTime.mock.calls[1][0];
    const retriggerTarget = target.linearRampToValueAtTime.mock.calls[2][0];
    expect(heldValue).toBeCloseTo(0.95);
    expect(retriggerTarget).toBeLessThanOrEqual(heldValue);
  });

  it("cancels future ducking and restores unity on Stop", () => {
    const { target, automation } = createAutomation();

    automation.schedule(request({ startTime: 10 }));
    automation.stop(10.05);

    expect(target.cancelAndHoldAtTime).toHaveBeenLastCalledWith(10.05);
    const heldCall = target.setValueAtTime.mock.calls.at(-1)!;
    expect(heldCall[0]).toBeCloseTo(0.75);
    expect(heldCall[1]).toBe(10.05);
    expect(target.linearRampToValueAtTime).toHaveBeenLastCalledWith(
      1,
      10.05 + MIN_DUCK_RAMP,
    );
  });

  it("does not schedule after destruction", () => {
    const { target, automation } = createAutomation();

    automation.destroy();
    automation.schedule(request());
    automation.stop(10);

    expect(target.setValueAtTime).not.toHaveBeenCalled();
    expect(target.linearRampToValueAtTime).not.toHaveBeenCalled();
    expect(target.cancelAndHoldAtTime).not.toHaveBeenCalled();
  });
});
