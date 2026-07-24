import { describe, expect, test, vi } from "vitest";
import { WritableSignal } from "./signal.js";

class TestSignal<T> extends WritableSignal<T> {
  update(value: T) {
    this.set(value);
  }
}

describe("Signal", () => {
  test("delivers the current value immediately and future values", () => {
    const signal = new TestSignal(1);
    const subscriber = vi.fn();

    signal.subscribe(subscriber);
    signal.update(2);

    expect(subscriber.mock.calls).toEqual([[1], [2]]);
    expect(signal.value).toBe(2);
  });

  test("supports idempotent unsubscription", () => {
    const signal = new TestSignal(1);
    const subscriber = vi.fn();
    const unsubscribe = signal.subscribe(subscriber);

    unsubscribe();
    unsubscribe();
    signal.update(2);

    expect(subscriber).toHaveBeenCalledOnce();
  });
});
