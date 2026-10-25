import {
  assertCycleBarLimit,
  MAX_EVENT_CYCLE_STEPS,
} from "@web-audio/patterns";
import type { NumericPatternValue } from "@/inputs/types";
import { createParameterValue } from "@/parameters/parameter";
import type { SamplerEventState } from "@/events/state";
import { releaseEventTiming } from "@/events/transitions";
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
  // Timing ownership does not require reading a live chop sequence.
  const release =
    configuration.chop !== undefined ||
    (state.notes.intent !== "authored" && !configuration.hasRegion);
  return {
    state: release ? releaseEventTiming(state) : state,
    configuration: next,
  };
}

function setSamplerEventChop(
  state: SamplerEventState,
  configuration: SamplerTimingConfiguration,
  sliceCount: number,
  sequence?: NumericPatternValue,
) {
  if (!Number.isInteger(sliceCount) || sliceCount <= 0)
    throw new Error("[Sampler] chop() sliceCount must be a positive integer.");
  if (sliceCount > MAX_EVENT_CYCLE_STEPS)
    throw new Error(
      `[Pattern] Generated chop contains more than ${MAX_EVENT_CYCLE_STEPS} events.`,
    );

  const authoredSequence =
    sequence === undefined
      ? null
      : createParameterValue(sequence, "[Sampler] chop() sequence");

  return {
    state: releaseEventTiming(state),
    configuration: Object.freeze({
      ...configuration,
      chop: Object.freeze({
        sliceCount,
        // Chop sequences are unchanged processing patterns, not event lanes.
        sequence: authoredSequence,
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
