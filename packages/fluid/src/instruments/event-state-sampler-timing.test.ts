import { describe, expect, it } from "vitest";
import {
  createSamplerEventState,
  replaceEventNotes,
  setEventRoot,
} from "@/events/transitions";
import { decodeNotesInputGeometry } from "@/inputs/decode-structured-input";
import {
  getGeneratedSamplerTiming,
  setSamplerEventChop,
  setSamplerEventFit,
} from "./sampler-event-timing";

const hit = (offset: number, duration: number) => ({ offset, duration });

describe("native sampler timing configuration", () => {
  it("keeps generated fit outside authored IR and leaves caller state/configuration untouched", () => {
    const state = setEventRoot(createSamplerEventState("bd"), 57);
    const configuration = { hasRegion: false };
    const before = structuredClone(state);
    const next = setSamplerEventFit(state, configuration, 2);
    expect(getGeneratedSamplerTiming(next.state, next.configuration)).toEqual({
      cycle: [[hit(0, 1)], [hit(0, 1)]],
    });
    expect(state).toEqual(before);
    expect(next.state).toEqual(state);
    expect(next.state).not.toHaveProperty("timingOverride");
    expect(configuration).toEqual({ hasRegion: false });
    expect(Object.isFrozen(configuration)).toBe(false);
    expect(Object.isFrozen(next.configuration)).toBe(true);

    const first = getGeneratedSamplerTiming(next.state, next.configuration);
    if (!first) throw new Error("Expected fit timing");
    first.cycle[0][0].duration = 99;
    expect(getGeneratedSamplerTiming(next.state, next.configuration)).toEqual({
      cycle: [[hit(0, 1)], [hit(0, 1)]],
    });
  });

  it("does not generate fit when authored notes or sample-region configuration owns playback", () => {
    const initial = createSamplerEventState("bd");
    const decoded = decodeNotesInputGeometry([[60, 64]]);
    const authored = replaceEventNotes(initial, decoded.cycle);
    const fit = setSamplerEventFit(authored, {}, 2);
    expect(fit.state).toBe(authored);
    expect(
      getGeneratedSamplerTiming(authored, fit.configuration),
    ).toBeUndefined();
    expect(
      getGeneratedSamplerTiming(initial, { fitBars: 2, hasRegion: true }),
    ).toBeUndefined();
  });

  it("chop takes priority over authored notes, region configuration, and fit, preserving cross-bar gates", () => {
    const decoded = decodeNotesInputGeometry([[60, 64]]);
    const state = replaceEventNotes(
      createSamplerEventState("loop"),
      decoded.cycle,
    );
    const initial = { fitBars: 4, hasRegion: true };
    const chop = setSamplerEventChop(state, initial, 2);
    expect(getGeneratedSamplerTiming(chop.state, chop.configuration)).toEqual({
      cycle: [[hit(0, 2)], [], [hit(0, 2)], []],
    });
    expect(initial).toEqual({ fitBars: 4, hasRegion: true });
    expect(Object.isFrozen(initial)).toBe(false);
    expect(Object.isFrozen(chop.configuration.chop)).toBe(true);
  });

  it.each([0, -1, 1.5, Number.NaN, Infinity])(
    "rejects invalid fit/chop amount %s before updating state",
    (amount) => {
      const state = createSamplerEventState("bd");
      expect(() => setSamplerEventFit(state, {}, amount)).toThrow(
        "positive integer",
      );
      expect(() => setSamplerEventChop(state, {}, amount)).toThrow(
        "positive integer",
      );
      expect(state).toEqual(createSamplerEventState("bd"));
    },
  );

  it("bounds generated bars and slices before allocation, accepting the exact boundaries", () => {
    const state = createSamplerEventState("bd");
    expect(setSamplerEventFit(state, {}, 1024).configuration.fitBars).toBe(
      1024,
    );
    expect(
      setSamplerEventChop(state, {}, 16384).configuration.chop.sliceCount,
    ).toBe(16384);
    expect(() => setSamplerEventFit(state, {}, 1025)).toThrow("1024 bars");
    expect(() => setSamplerEventChop(state, {}, 16385)).toThrow("16384 events");
  });
});
