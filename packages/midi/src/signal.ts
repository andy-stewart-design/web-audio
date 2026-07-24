import type { Signal } from "./types.js";

class WritableSignal<T> implements Signal<T> {
  private _value: T;
  private _subscribers = new Set<(value: T) => void>();

  constructor(value: T) {
    this._value = value;
  }

  get value() {
    return this._value;
  }

  subscribe(fn: (value: T) => void) {
    this._subscribers.add(fn);
    fn(this._value);

    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this._subscribers.delete(fn);
    };
  }

  set(value: T) {
    this._value = value;
    this._subscribers.forEach((fn) => fn(value));
  }
}

export { WritableSignal };
