import { afterEach, describe, expect, it, vi } from "vitest";
import AudioTimeScheduler from "./audio-time-scheduler";

afterEach(() => vi.useRealTimers());

describe("AudioTimeScheduler", () => {
  it("resolves only when audio context time reaches the target", async () => {
    vi.useFakeTimers();
    const ctx = { currentTime: 1 } as BaseAudioContext;
    const scheduler = new AudioTimeScheduler(ctx);
    const wait = scheduler.waitUntil(2);
    let result: boolean | undefined;
    void wait.promise.then((value) => {
      result = value;
    });

    await vi.advanceTimersByTimeAsync(100);
    expect(result).toBeUndefined();
    Object.assign(ctx, { currentTime: 2 });
    await vi.advanceTimersByTimeAsync(10);
    expect(result).toBe(true);
  });

  it("cancels pending waits idempotently", async () => {
    vi.useFakeTimers();
    const scheduler = new AudioTimeScheduler({
      currentTime: 0,
    } as BaseAudioContext);
    const wait = scheduler.waitUntil(10);

    wait.cancel();
    wait.cancel();

    await expect(wait.promise).resolves.toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("destroy cancels every wait", async () => {
    vi.useFakeTimers();
    const scheduler = new AudioTimeScheduler({
      currentTime: 0,
    } as BaseAudioContext);
    const waits = [scheduler.waitUntil(1), scheduler.waitUntil(2)];

    scheduler.destroy();

    await expect(
      Promise.all(waits.map((wait) => wait.promise)),
    ).resolves.toEqual([false, false]);
  });
});
