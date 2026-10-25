import {
  createStructuredInput,
  MAX_EVENT_CYCLE_STEPS,
} from "@web-audio/patterns";
import { afterEach, describe, expect, it, vi } from "vitest";
import Drome from "@/drome";
import Parameter, { createParameter } from "@/parameters/parameter";
import Sampler from "../sampler";
import {
  createSamplerEventState,
  replaceEventNotes,
  setEventPitch,
} from "@/events/transitions";
import { decodeNotesInputGeometry } from "@/inputs/decode-structured-input";
import {
  getGeneratedSamplerTiming,
  setSamplerEventChop,
  setSamplerEventFit,
} from "../sampler-event-timing";

const hit = (offset: number, duration: number) => ({ offset, duration });

describe("native sampler timing configuration", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps generated fit outside authored IR and leaves caller state/configuration untouched", () => {
    const state = setEventPitch(createSamplerEventState("bd"), { root: 57 });
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

  it("uses generated chop timing with and without fit", () => {
    const state = createSamplerEventState("loop");
    const withoutFit = setSamplerEventChop(state, {}, 4);
    const withFit = setSamplerEventFit(
      withoutFit.state,
      withoutFit.configuration,
      2,
    );

    expect(getGeneratedSamplerTiming(state, withoutFit.configuration)).toEqual({
      cycle: [[hit(0, 0.25), hit(0.25, 0.25), hit(0.5, 0.25), hit(0.75, 0.25)]],
    });
    expect(
      getGeneratedSamplerTiming(withFit.state, withFit.configuration),
    ).toEqual({
      cycle: [
        [hit(0, 0.5), hit(0.5, 0.5)],
        [hit(0, 0.5), hit(0.5, 0.5)],
      ],
    });
  });

  it("keeps random chop serialization lazy through both setter orders", () => {
    const cases = [
      (sampler: Sampler, random: ReturnType<Drome["rand"]>) =>
        sampler.chop(4, random).fit(3),
      (sampler: Sampler, random: ReturnType<Drome["rand"]>) =>
        sampler.fit(3).chop(4, random),
    ];

    for (const configure of cases) {
      const d = new Drome();
      const random = d.rand().int().steps(2, 0, 3).range(0, 3);
      const getRandomSchema = vi.spyOn(random, "getRandomSchema");
      const sampler = configure(d.sample("bd"), random);

      expect(getRandomSchema).not.toHaveBeenCalled();
      const schema = sampler.getSchema();
      expect(schema.region).toMatchObject({
        type: "chop",
        sequence: {
          type: "random-number",
          valuesPerBar: [2, 0, 3],
        },
      });
      expect(schema.eventPattern.timing.cycle).toEqual([
        [hit(0, 0.5), hit(0.5, 0.5)],
        [],
        [hit(0, 1 / 3), hit(1 / 3, 1 / 3), hit(2 / 3, 1 / 3)],
      ]);
    }
  });

  it("retains random configuration added after chop and fit", () => {
    const d = new Drome();
    const deferredRandom = d.rand();
    const deferred = d.sample("bd").chop(4, deferredRandom).fit(3);
    deferredRandom.int().steps(2, 0, 3).range(0, 3);

    const controlRandom = d.rand().int().steps(2, 0, 3).range(0, 3);
    const control = d.sample("bd").chop(4, controlRandom).fit(3);

    const deferredSchema = deferred.getSchema();
    const controlSchema = control.getSchema();
    expect(deferredSchema.region).toEqual(controlSchema.region);
    expect(deferredSchema.eventPattern.timing).toEqual(
      controlSchema.eventPattern.timing,
    );
  });

  it("distributes a default random chop count across fit bars", () => {
    const random = new Drome().rand().int().range(0, 3);
    const schema = new Drome().sample("bd").chop(4, random).fit(2).getSchema();

    expect(schema.region).toMatchObject({
      type: "chop",
      sequence: { type: "random-number", valuesPerBar: [2, 2] },
    });
    expect(schema.eventPattern.timing.cycle).toEqual(
      Array.from({ length: 2 }, () => [hit(0, 0.5), hit(0.5, 0.5)]),
    );
  });

  it("distinguishes generated chop timing from a scalar authored sequence", () => {
    const generated = new Sampler("bd").chop(4).fit(2).getSchema();
    const authored = new Sampler("bd").chop(4, 0).fit(2).getSchema();
    const wrapped = new Sampler("bd")
      .chop(4, createStructuredInput(0))
      .fit(2)
      .getSchema();
    expect(authored).toEqual(wrapped);

    expect(generated.eventPattern.timing.cycle).toEqual([
      [hit(0, 0.5), hit(0.5, 0.5)],
      [hit(0, 0.5), hit(0.5, 0.5)],
    ]);
    expect(authored.region).toMatchObject({
      sequence: { type: "static", cycle: [[0]] },
    });
    expect(authored.eventPattern.timing.cycle).toEqual([[hit(0, 1)]]);
  });

  it("preserves nonuniform authored chop bars regardless of fit order", () => {
    const d = new Drome();
    const sequence = d.str([0, 2], [1], [3, 2, 1]);
    const beforeFit = d.sample("bd").chop(4, sequence).fit(2).getSchema();
    const afterFit = d.sample("bd").fit(2).chop(4, sequence).getSchema();
    const expectedRegion = {
      type: "chop",
      slices: [
        { start: 0, end: 0.25 },
        { start: 0.25, end: 0.5 },
        { start: 0.5, end: 0.75 },
        { start: 0.75, end: 1 },
      ],
      sequence: { type: "static", cycle: [[0, 2], [1], [3, 2, 1]] },
    };
    const expectedTiming = [
      [hit(0, 0.5), hit(0.5, 0.5)],
      [hit(0, 1)],
      [hit(0, 1 / 3), hit(1 / 3, 1 / 3), hit(2 / 3, 1 / 3)],
    ];

    expect(beforeFit.region).toEqual(expectedRegion);
    expect(afterFit.region).toEqual(expectedRegion);
    expect(beforeFit.eventPattern.timing.cycle).toEqual(expectedTiming);
    expect(afterFit.eventPattern.timing.cycle).toEqual(expectedTiming);
  });

  it("warns about out-of-range authored indices only when serializing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sequence = createStructuredInput([-1, 4]);
    const sampler = new Sampler("bd").chop(4, sequence);
    expect(warn).not.toHaveBeenCalled();
    const schema = sampler.getSchema();
    expect(schema.region).toMatchObject({
      type: "chop",
      sequence: { type: "static", cycle: [[-1, 4]] },
    });
    expect(schema.eventPattern.timing.cycle).toEqual([
      [hit(0, 0.5), hit(0.5, 0.5)],
    ]);
    expect(warn.mock.calls).toEqual([
      [
        "[Sampler] chop() sequence index -1 is outside [0, 3] and will wrap in the engine.",
      ],
      [
        "[Sampler] chop() sequence index 4 is outside [0, 3] and will wrap in the engine.",
      ],
    ]);
  });

  it("keeps authored chop sequence timing unchanged when fit is added", () => {
    const state = createSamplerEventState("loop");
    const authored = setSamplerEventChop(
      state,
      {},
      4,
      createStructuredInput([0, 2, 1, 3]),
    );
    const withFit = setSamplerEventFit(
      authored.state,
      authored.configuration,
      2,
    );

    const expected = {
      cycle: [[hit(0, 0.25), hit(0.25, 0.25), hit(0.5, 0.25), hit(0.75, 0.25)]],
    };
    expect(getGeneratedSamplerTiming(state, authored.configuration)).toEqual(
      expected,
    );
    expect(
      getGeneratedSamplerTiming(withFit.state, withFit.configuration),
    ).toEqual(expected);
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

  it("rejects invalid counts and sequence shapes without releasing authored state", () => {
    const d = new Drome();
    const state = replaceEventNotes(
      createSamplerEventState("bd"),
      decodeNotesInputGeometry([[60, 64]]).cycle,
    );
    const configuration = {
      fitBars: 2,
      hasRegion: true,
      chop: Object.freeze({
        sliceCount: 4,
        sequence: createParameter([0, 2, 1, 3]),
      }),
    };
    const beforeState = structuredClone(state);
    const beforeConfiguration = { ...configuration };
    const invalidCalls: unknown[][] = [
      [state, configuration],
      [state, configuration, 4, []],
      [state, configuration, 4, [0, 1]],
      [state, configuration, 4, d.str(null)],
      [state, configuration, 4, d.str("0 1")],
      [state, configuration, 4, d.str([[0, 1]])],
      [state, configuration, 4, [Number.NaN]],
      [state, configuration, 4, [[Number.NaN]]],
      [state, configuration, 4, d.env()],
      [state, configuration, 4, d.lfo(0, 1)],
      [state, configuration, 4, d.midi.cc(74)],
      [state, configuration, 4, new Parameter(0.2)],
      [state, configuration, 4, d.sh("0 ~ 1")],
      [state, configuration, 4, ""],
      [state, configuration, 4, "0 ~ 1"],
      [state, configuration, 4, null],
      [state, configuration, 4, true],
      [state, configuration, 4, Number.NaN],
      [state, configuration, 4, Number.POSITIVE_INFINITY],
      [state, configuration, 0, "0 1"],
      [state, configuration, -1, "0 1"],
      [state, configuration, 1.5, "0 1"],
      [state, configuration, Number.NaN, "0 1"],
      [state, configuration, Number.POSITIVE_INFINITY, "0 1"],
    ];

    for (const args of invalidCalls) {
      expect(() =>
        Reflect.apply(setSamplerEventChop, undefined, args),
      ).toThrow();
      expect(state).toEqual(beforeState);
      expect(configuration).toEqual(beforeConfiguration);
    }

    expect(() =>
      Reflect.apply(setSamplerEventChop, undefined, [
        state,
        configuration,
        4,
        d.str([]),
      ]),
    ).toThrow();
    expect(state).toEqual(beforeState);
    expect(configuration).toEqual(beforeConfiguration);
  });

  it("rejects public chop sequences before changing event, fit, chop, or region identities", () => {
    const d = new Drome();
    const sampler = new Sampler("bd")
      .fit(2)
      .start(0.1)
      .end(0.9)
      .chop(4, "0 1 2 3");
    const fields = ["_eventState", "_fit", "_chop", "_region"] as const;
    const before = fields.map((field) => Reflect.get(sampler, field));
    const beforeSchema = sampler.getSchema();
    const invalid: unknown[][] = [
      [4, undefined],
      [4, []],
      [4, [0, 1]],
      [4, "0 ~ 1"],
      [4, ""],
      [4, null],
      [4, false],
      [4, Number.NaN],
      [4, Number.POSITIVE_INFINITY],
      [0],
      [-1],
      [1.5],
      [Number.NaN],
      [Number.POSITIVE_INFINITY],
      [MAX_EVENT_CYCLE_STEPS + 1],
      [4, "0 1", 2],
      [4, d.str([[0, 1]])],
      [4, d.str(null)],
      [4, d.str("0 1")],
      [4, [Number.NaN]],
      [4, [[Number.NaN]]],
      [4, d.env()],
      [4, d.lfo(0, 1)],
      [4, d.midi.cc(74)],
      [4, new Parameter(0.2)],
    ];

    for (const args of invalid) {
      expect(() => Reflect.apply(sampler.chop, sampler, args)).toThrow();
      fields.forEach((field, index) => {
        expect(Reflect.get(sampler, field)).toBe(before[index]);
      });
      expect(sampler.getSchema()).toEqual(beforeSchema);
    }

    expect(() =>
      Reflect.apply(sampler.chop, sampler, [4, d.str([])]),
    ).toThrow();
    fields.forEach((field, index) => {
      expect(Reflect.get(sampler, field)).toBe(before[index]);
    });
    expect(sampler.getSchema()).toEqual(beforeSchema);
  });
});
