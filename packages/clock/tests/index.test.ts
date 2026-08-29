import { afterEach, describe, expect, test, vi } from "vitest";
import AudioClock from "../src/index.js";

class FakeAudioContext {
  currentTime = 0;
  state: AudioContextState = "running";
  resume = vi.fn(async () => undefined);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("AudioClock scheduling lead", () => {
  test("uses the public scheduling lead for initial start time", async () => {
    vi.useFakeTimers();
    const ctx = new FakeAudioContext();
    const clock = new AudioClock(ctx as unknown as AudioContext);
    const starts: number[] = [];
    clock.on("start", (_metronome, time) => starts.push(time));

    await clock.start();

    expect(clock.schedulingLeadTime).toBe(AudioClock.scheduleAheadTime);
    expect(clock.schedulingInterval).toBe(AudioClock.lookahead / 1000);
    expect(starts).toEqual([AudioClock.scheduleAheadTime]);
    clock.destroy();
  });

  test("includes the current bar duration in event callbacks", async () => {
    vi.useFakeTimers();
    const ctx = new FakeAudioContext();
    const clock = new AudioClock(ctx as unknown as AudioContext, 120, 4);
    const durations: number[] = [];
    clock.on("start", (_metronome, _time, barDuration) => {
      durations.push(barDuration);
    });

    await clock.start();

    expect(durations).toEqual([2]);
    clock.destroy();
  });

  test("exposes later bars with approximately the same scheduling lead", async () => {
    vi.useFakeTimers();
    const ctx = new FakeAudioContext();
    const clock = new AudioClock(ctx as unknown as AudioContext);
    const leads: number[] = [];
    clock.on("bar", ({ bar }, time) => {
      if (bar > 0) leads.push(time - ctx.currentTime);
    });
    await clock.start();

    ctx.currentTime = 2.001;
    await vi.advanceTimersByTimeAsync(AudioClock.lookahead);

    expect(leads).toHaveLength(1);
    expect(leads[0]).toBeGreaterThanOrEqual(
      clock.schedulingLeadTime - clock.schedulingInterval,
    );
    clock.destroy();
  });
});
