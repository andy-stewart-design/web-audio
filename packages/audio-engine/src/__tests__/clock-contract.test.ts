import type AudioClock from "@web-audio/clock";
import { describe, expectTypeOf, it } from "vitest";
import AudioEngine, { type EngineClock } from "../index";
import type { InstrumentClock } from "../types";
import type Instrument from "../instruments/instrument";
import type Sampler from "../instruments/sampler";
import type Synthesizer from "../instruments/synthesizer";
import { createManualClock } from "./support/manual-clock";

// These assertions and uninvoked constructor calls are checked by tsc.
describe("engine clock contract", () => {
  it("accepts the real-time clock without requiring its transport/state API", () => {
    const acceptClock = (clock: EngineClock) => clock;
    const acceptRealTimeClock = (clock: AudioClock) => acceptClock(clock);

    expectTypeOf(acceptRealTimeClock).returns.toEqualTypeOf<EngineClock>();
    expectTypeOf<
      ConstructorParameters<typeof AudioEngine>[1]
    >().toEqualTypeOf<EngineClock>();
    expectTypeOf<keyof EngineClock>().toEqualTypeOf<
      | "on"
      | "bpm"
      | "barDuration"
      | "ctx"
      | "schedulingLeadTime"
      | "schedulingInterval"
      | "audioTimeToMIDITime"
    >();
    expectTypeOf<EngineClock["ctx"]>().toEqualTypeOf<{
      readonly currentTime: number;
    }>();
  });

  it("type-checks a minimal driver with either native context without casts", () => {
    const constructEngine = (ctx: AudioContext | OfflineAudioContext) =>
      new AudioEngine(ctx, createManualClock(ctx).clock);

    expectTypeOf(constructEngine).returns.toEqualTypeOf<AudioEngine>();
  });

  it("requires only bar duration in instrument consumers", () => {
    expectTypeOf<keyof InstrumentClock>().toEqualTypeOf<"barDuration">();
    expectTypeOf<
      ConstructorParameters<typeof Instrument>[1]
    >().toEqualTypeOf<InstrumentClock>();
    expectTypeOf<
      ConstructorParameters<typeof Synthesizer>[1]
    >().toEqualTypeOf<InstrumentClock>();
    expectTypeOf<
      ConstructorParameters<typeof Sampler>[1]
    >().toEqualTypeOf<InstrumentClock>();
  });
});
