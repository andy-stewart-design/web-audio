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
import type {
  BinaryCycleData,
  Cycle,
  SourceHitReference,
  TimingSchema,
  TimingStep,
} from "./types";

type ActiveStep = SourceHitReference & {
  type: "active";
};

type RestStep = { type: "rest" };
type MaskedStep = ActiveStep | RestStep;

const REST: RestStep = { type: "rest" };

/**
 * Keeps source content independent from the trigger grid that determines when
 * that content is consumed. Grid steps retain source references or rests, so
 * source values advance only across active positions while rests retain timing.
 */
class MaskedCycle<T> {
  private _source: Cycle<T>;
  private _grid: Cycle<MaskedStep>;

  constructor(source: Cycle<T>) {
    this._source = source.map((bar) => [...bar]);
    this._grid = source.map((bar, sourceBarIndex) =>
      bar.map((_, sourceHitIndex) => ({
        type: "active",
        sourceBarIndex,
        sourceHitIndex,
      })),
    );
  }

  setMask(mask: BinaryCycleData) {
    this._grid = applyPattern(this._grid, mask, REST).map((bar) =>
      bar.map((step) => (step?.type === "active" ? step : REST)),
    );
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

  get sourceValues() {
    return this._source.map((bar) => [...bar]);
  }

  get candidateTiming(): TimingSchema {
    const cycle = this._grid.map((bar) => {
      if (bar.length === 0) return [];

      const duration = 1 / bar.length;
      return bar.reduce<TimingStep[]>((timing, step, positionIndex) => {
        if (step.type === "active") {
          timing.push({ offset: duration * positionIndex, duration });
        }
        return timing;
      }, []);
    });

    return { cycle };
  }

  get fixedRestFilter(): BinaryCycleData {
    return this._grid.map((bar) =>
      bar.map((step) => (step.type === "active" ? 1 : 0)),
    );
  }

  get activeSourceReferences(): Cycle<SourceHitReference> {
    return this._grid.map((bar) =>
      bar.flatMap((step) =>
        step.type === "active"
          ? [
              {
                sourceBarIndex: step.sourceBarIndex,
                sourceHitIndex: step.sourceHitIndex,
              },
            ]
          : [],
      ),
    );
  }

  get source() {
    return this.sourceValues;
  }

  get mask() {
    const filter = this.fixedRestFilter;
    if (!filter.some((bar) => bar.includes(0))) return undefined;
    return filter;
  }

  get activeEvents() {
    return this.activeSourceReferences.map((bar) =>
      bar.flatMap(({ sourceBarIndex, sourceHitIndex }) => {
        const value = this._source[sourceBarIndex]?.[sourceHitIndex];
        return value === undefined ? [] : [value];
      }),
    );
  }
}

export { MaskedCycle };
