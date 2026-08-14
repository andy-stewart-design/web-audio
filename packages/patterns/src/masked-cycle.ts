import type { Cycle } from "./types";

type BinaryMask = Cycle<0 | 1>;

/**
 * Keeps source content independent from the trigger grid that determines when
 * that content is consumed. Source values advance only at active mask slots.
 */
class MaskedCycle<T> {
  private _source: Cycle<T>;
  private _mask: BinaryMask | undefined;

  constructor(source: Cycle<T>) {
    this._source = source;
  }

  setMask(mask: BinaryMask) {
    this._mask = mask;
    return this;
  }

  get source() {
    return this._source;
  }

  get mask() {
    return this._mask;
  }

  get activeEvents() {
    if (!this._mask) return this._source;

    const bars = Math.max(this._source.length, this._mask.length);
    const events: Cycle<T> = [];

    for (let barIndex = 0; barIndex < bars; barIndex++) {
      const source = this._source[barIndex % this._source.length] ?? [];
      const mask = this._mask[barIndex % this._mask.length] ?? [];
      const active: T[] = [];
      let sourceIndex = 0;

      for (const enabled of mask) {
        if (enabled === 0 || source.length === 0) continue;
        active.push(source[sourceIndex % source.length]);
        sourceIndex++;
      }

      events.push(active);
    }

    return events;
  }
}

export { MaskedCycle, type BinaryMask };
