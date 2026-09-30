import { MaskedCycle } from "@web-audio/patterns";
import EventTiming from "@/patterns/event-timing";
import type { TimingPattern } from "@web-audio/schema";

const TRANSPARENT_TIMING_GAP = Symbol("transparent timing gap");
type AvailabilityValue = boolean | typeof TRANSPARENT_TIMING_GAP | null;
type AvailabilityState = {
  intent: "authored" | "aligned";
  cycle: MaskedCycle<AvailabilityValue>;
};

class AuthoredAvailability {
  private _state: AvailabilityState;

  constructor(cycle: boolean[][]) {
    this._state = {
      intent: "authored",
      cycle: new MaskedCycle<AvailabilityValue>(cycle),
    };
  }

  get fixedCycle() {
    const { cycle, intent } = this._state;
    const values = cycle.transformedValues;
    const restFilter = cycle.fixedRestFilter;
    return values.map((bar, barIndex) => {
      const candidates = bar.flatMap((value, hitIndex) => {
        // When timing is aligned, its own transformed gaps are not additional
        // candidate-ordinal rests. A later timing setter releases them below.
        if (!restFilter[barIndex][hitIndex]) {
          return intent === "aligned" ? [] : [false];
        }
        return value === TRANSPARENT_TIMING_GAP ? [] : [value === true];
      });
      return candidates.length > 0 ? candidates : [true];
    });
  }

  get hasRests() {
    return this.fixedCycle.some((bar) => bar.some((available) => !available));
  }

  materializeAgainstTiming(timing: TimingPattern) {
    if (this._state.intent === "aligned") return this;

    const source = this.fixedCycle;
    const { cycle, mask } = new EventTiming(timing).alignValues(source);
    const materialized = new MaskedCycle<AvailabilityValue>(cycle).xox(
      ...mask,
    ).transformedValues;
    this._state = {
      intent: "aligned",
      cycle: new MaskedCycle(
        materialized.map((bar, barIndex) =>
          bar.length === 0
            ? [...source[barIndex % source.length]]
            : bar.map((value) =>
                value === null ? TRANSPARENT_TIMING_GAP : value,
              ),
        ),
      ),
    };
    return this;
  }

  releaseTiming() {
    if (this._state.intent === "authored") return this;

    const values = this._state.cycle.transformedValues;
    const restFilter = this._state.cycle.fixedRestFilter;
    this._state = {
      intent: "authored",
      cycle: new MaskedCycle(
        values.map((bar, barIndex) =>
          bar.map((value, hitIndex) =>
            restFilter[barIndex][hitIndex] ? value : false,
          ),
        ),
      ),
    };
    return this;
  }

  reverse() {
    this._state.cycle.reverse();
    return this;
  }

  fast(multiplier: number) {
    this._state.cycle.fast(multiplier);
    return this;
  }

  slow(multiplier: number) {
    this._state.cycle.slow(multiplier);
    return this;
  }

  stretch(bars: number, steps?: number) {
    this._state.cycle.stretch(bars, steps);
    return this;
  }
}

export default AuthoredAvailability;
