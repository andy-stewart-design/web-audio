import {
  assertCycleBarLimit,
  MAX_EVENT_CYCLE_STEPS,
} from "@web-audio/patterns";
import type { CycleInput } from "@/types";
import Parameter from "@/patterns/parameter";
import type { SamplerEventState } from "./event-state";
import { releaseEventTiming } from "./event-state-transitions";
import {
  getChopTiming,
  getDistributedTiming,
  type ChopState,
} from "./sampler-utils";

/** Sampler configuration stays separate from authored event state. */
type SamplerTimingConfiguration = {
  readonly fitBars?: number;
  readonly chop?: Readonly<ChopState>;
  readonly hasRegion?: boolean;
};

function getGeneratedSamplerTiming(
  state: SamplerEventState,
  configuration: SamplerTimingConfiguration,
) {
  const { chop, fitBars, hasRegion } = configuration;
  if (chop) return getChopTiming(chop, fitBars ?? 1);
  if (fitBars && state.notes.intent !== "authored" && !hasRegion)
    return getDistributedTiming(fitBars, fitBars);
  return undefined;
}

function setSamplerEventFit(
  state: SamplerEventState,
  configuration: SamplerTimingConfiguration,
  bars: number,
) {
  if (!Number.isInteger(bars) || bars <= 0)
    throw new Error("[Sampler] fit() bars must be a positive integer.");
  assertCycleBarLimit(bars);
  const next = Object.freeze({ ...configuration, fitBars: bars });
  const release =
    getGeneratedSamplerTiming(state, configuration) !== undefined ||
    getGeneratedSamplerTiming(state, next) !== undefined;
  return {
    state: release ? releaseEventTiming(state) : state,
    configuration: next,
  };
}

function setSamplerEventChop(
  state: SamplerEventState,
  configuration: SamplerTimingConfiguration,
  sliceCount: number,
  ...sequence: CycleInput<number>
) {
  if (!Number.isInteger(sliceCount) || sliceCount <= 0)
    throw new Error("[Sampler] chop() sliceCount must be a positive integer.");
  if (sliceCount > MAX_EVENT_CYCLE_STEPS)
    throw new Error(
      `[Pattern] Generated chop contains more than ${MAX_EVENT_CYCLE_STEPS} events.`,
    );
  return {
    state: releaseEventTiming(state),
    configuration: Object.freeze({
      ...configuration,
      chop: Object.freeze({
        sliceCount,
        // Chop sequences are unchanged processing patterns, not event lanes.
        sequence: sequence.length > 0 ? new Parameter(...sequence) : null,
      }),
    }),
  };
}

export {
  getGeneratedSamplerTiming,
  setSamplerEventFit,
  setSamplerEventChop,
  type SamplerTimingConfiguration,
};
