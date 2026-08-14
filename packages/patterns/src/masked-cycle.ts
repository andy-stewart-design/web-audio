import {
  applyPattern,
  euclid,
  fast,
  hex,
  reverse,
  sequence,
  slow,
  stretch,
  xox,
} from "./utils";
import type { BinaryCycleData, Cycle } from "./types";

type ActiveStep = {
  type: "active";
  sourceBarIndex: number;
  sourceStepIndex: number;
};

type RestStep = { type: "rest" };
type MaskedStep = ActiveStep | RestStep;

const REST: RestStep = { type: "rest" };

/**
 * Keeps source content independent from the trigger grid that determines when
 * that content is consumed. Source values advance only at active mask slots.
 */
class MaskedCycle<T> {
  private _source: Cycle<T>;
  private _grid: Cycle<MaskedStep>;

  constructor(source: Cycle<T>) {
    this._source = source;
    this._grid = source.map((bar, sourceBarIndex) =>
      bar.map((_, sourceStepIndex) => ({
        type: "active",
        sourceBarIndex,
        sourceStepIndex,
      })),
    );
  }

  setMask(mask: BinaryCycleData) {
    this._grid = applyPattern(this._grid, mask, REST);
    return this;
  }

  euclid(
    pulses: number | number[],
    steps: number,
    rotation: number | number[] = 0,
  ) {
    return this.setMask(euclid(pulses, steps, rotation));
  }

  hex(...input: (string | number)[]) {
    return this.setMask(input.map(hex));
  }

  sequence(steps: number, ...pulses: (number | number[])[]) {
    return this.setMask(sequence(steps, ...pulses));
  }

  xox(...input: (number | number[])[] | string[]) {
    return this.setMask(xox(...input));
  }

  fast(multiplier: number) {
    const grid = fast(this._grid, REST, multiplier);
    if (grid) this._grid = grid;
    return this;
  }

  slow(multiplier: number) {
    const grid = slow(this._grid, REST, multiplier);
    if (grid) this._grid = grid;
    return this;
  }

  stretch(bars: number, steps?: number) {
    this._grid = stretch(this._grid, bars, steps);
    return this;
  }

  reverse() {
    this._grid = reverse(this._grid);
    return this;
  }

  get source() {
    return this._source;
  }

  get mask() {
    const hasRest = this._grid.some((bar) =>
      bar.some((step) => step.type === "rest"),
    );
    if (!hasRest) return undefined;

    return this._grid.map((bar) =>
      bar.map((step) => (step.type === "active" ? 1 : 0)),
    );
  }

  get activeEvents() {
    return this._grid.map((bar) =>
      bar.flatMap((step) => {
        if (step.type === "rest") return [];
        const source = this._source[step.sourceBarIndex];
        const value = source?.[step.sourceStepIndex];
        return value === undefined ? [] : [value];
      }),
    );
  }
}

export { MaskedCycle };
