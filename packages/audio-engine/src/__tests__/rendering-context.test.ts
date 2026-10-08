import type AudioClock from "@web-audio/clock";
import { describe, expectTypeOf, it } from "vitest";
import AudioEngine from "../index";
import type RuntimeBus from "../buses/runtime-bus";
import type Instrument from "../instruments/instrument";
import type Sampler from "../instruments/sampler";
import type SampleBufferCache from "../instruments/sample-buffer-cache";
import type Synthesizer from "../instruments/synthesizer";
import type { registerWorklets } from "../utils/register-worklets";
import type { getReversedBuffer } from "../utils/reversed-buffer-cache";

// These assertions and the uninvoked constructor call are checked by tsc.
// Real browser construction/rendering is a separate harness integration gate.
describe("rendering context types", () => {
  it("accepts both native context types without casts", () => {
    const constructEngine = (
      ctx: AudioContext | OfflineAudioContext,
      clock: AudioClock,
    ) => new AudioEngine(ctx, clock);

    expectTypeOf(constructEngine).returns.toEqualTypeOf<AudioEngine>();
    expectTypeOf<
      ConstructorParameters<typeof AudioEngine>[0]
    >().toEqualTypeOf<BaseAudioContext>();
  });

  it("uses the common context throughout the rendering graph and helpers", () => {
    expectTypeOf<
      ConstructorParameters<typeof Instrument>[0]
    >().toEqualTypeOf<BaseAudioContext>();
    expectTypeOf<
      ConstructorParameters<typeof Synthesizer>[0]
    >().toEqualTypeOf<BaseAudioContext>();
    expectTypeOf<
      ConstructorParameters<typeof Sampler>[0]
    >().toEqualTypeOf<BaseAudioContext>();
    expectTypeOf<
      ConstructorParameters<typeof SampleBufferCache>[0]
    >().toEqualTypeOf<BaseAudioContext>();
    expectTypeOf<
      ConstructorParameters<typeof RuntimeBus>[0]
    >().toEqualTypeOf<BaseAudioContext>();
    expectTypeOf<
      Parameters<typeof registerWorklets>[0]
    >().toEqualTypeOf<BaseAudioContext>();
    expectTypeOf<
      Parameters<typeof getReversedBuffer>[0]
    >().toEqualTypeOf<BaseAudioContext>();
  });

  it("leaves context lifecycle ownership with the real-time clock", () => {
    expectTypeOf<
      ConstructorParameters<typeof AudioClock>[0]
    >().toEqualTypeOf<AudioContext>();
    expectTypeOf<AudioClock["ctx"]>().toEqualTypeOf<AudioContext>();
  });
});
