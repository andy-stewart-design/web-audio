import { applyPattern } from "./operations/apply-pattern";
import { reverse } from "./operations/reverse";
import { stretch } from "./operations/stretch";
import { euclid } from "../rhythm/euclid";
import { hex } from "../rhythm/hex";
import { sequence } from "../rhythm/sequence";
import { xox } from "../rhythm/xox";
import Speed from "./operations/speed";
import type { BinaryCycleData, Cycle, SourceHitReference } from "./types";
import type { TimingPattern, TimingStep } from "@web-audio/schema";

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
  private _speed = new Speed();

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
    this.applyPendingSpeed();
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
    this._speed.multiply(multiplier);
    return this;
  }

  slow(multiplier: number) {
    this._speed.divide(multiplier);
    return this;
  }

  stretch(bars: number, steps?: number) {
    this.applyPendingSpeed();
    this._grid = stretch(this._grid, bars, steps);
    return this;
  }

  reverse() {
    this.applyPendingSpeed();
    this._grid = reverse(this._grid);
    return this;
  }

  private applyPendingSpeed() {
    if (this._speed.isUnit) return;

    const grid = this._speed.applyTo(this._grid, REST);
    this._speed = new Speed();
    if (grid) this._grid = grid;
  }

  get sourceValues() {
    return this._source.map((bar) => [...bar]);
  }

  get candidateTiming(): TimingPattern {
    this.applyPendingSpeed();
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
    this.applyPendingSpeed();
    return this._grid.map((bar) =>
      bar.map((step) => (step.type === "active" ? 1 : 0)),
    );
  }

  get activeSourceReferences(): Cycle<SourceHitReference> {
    this.applyPendingSpeed();
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
    this.applyPendingSpeed();
    return this.activeSourceReferences.map((bar) =>
      bar.flatMap(({ sourceBarIndex, sourceHitIndex }) => {
        const value = this._source[sourceBarIndex]?.[sourceHitIndex];
        return value === undefined ? [] : [value];
      }),
    );
  }

  get transformedValues() {
    this.applyPendingSpeed();
    return this._grid.map((bar) =>
      bar.map((step) => {
        if (step.type === "rest") return null;
        return this._source[step.sourceBarIndex]?.[step.sourceHitIndex] ?? null;
      }),
    );
  }
}

export { MaskedCycle };
