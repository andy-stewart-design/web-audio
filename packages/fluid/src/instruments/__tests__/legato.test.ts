import { RandomCycle } from "@web-audio/patterns";
import { describe, expect, it } from "vitest";
import Sampler from "../sampler";
import Synthesizer from "../synthesizer";

const constructors = [
  { name: "synth", create: () => new Synthesizer() },
  { name: "sampler", create: () => new Sampler("bd") },
];

for (const { name, create } of constructors) {
  describe(`${name} legato`, () => {
    it("fills rests without changing onsets, values, or processing", () => {
      const instrument = create().notes([60, null, 64, null]);
      const before = instrument.getSchema();
      expect(instrument.legato()).toBe(instrument);
      const after = instrument.getSchema();
      expect(after).toEqual({
        ...before,
        eventPattern: {
          ...before.eventPattern,
          timing: {
            ...before.eventPattern.timing,
            cycle: [
              [
                { offset: 0, duration: 0.5 },
                { offset: 0.5, duration: 0.5 },
              ],
            ],
          },
        },
      });
      expect(before.eventPattern.timing.cycle).toEqual([
        [
          { offset: 0, duration: 0.25 },
          { offset: 0.5, duration: 0.25 },
        ],
      ]);
      expect(instrument.getSchema()).toEqual(after);
      expect(instrument.legato(false)).toBe(instrument);
      expect(instrument.getSchema()).toEqual(before);
    });

    it("wraps through leading, intervening, and trailing silent bars", () => {
      expect(
        create()
          .notes([null], [null, 60], [null], [64, null], [null])
          .legato()
          .getSchema().eventPattern.timing.cycle,
      ).toEqual([
        [],
        [{ offset: 0.5, duration: 1.5 }],
        [],
        [{ offset: 0, duration: 3.5 }],
        [],
      ]);
    });

    it("sustains a single onset for the complete cycle", () => {
      const cycle = create()
        .notes([null, 60], [null], [null])
        .legato()
        .getSchema().eventPattern.timing.cycle;
      expect(cycle).toEqual([[{ offset: 0.5, duration: 3 }], [], []]);
    });

    it("leaves wholly silent cycles silent", () => {
      const instrument = create().notes([null], [null]);
      const before = instrument.getSchema();
      expect(instrument.legato().getSchema()).toEqual(before);
    });

    it("extends chord gates without altering voice groups", () => {
      const instrument = create().notes([[60, 64], null, [62, 65], null]);
      const before = instrument.getSchema().eventPattern;
      const after = instrument.legato().getSchema().eventPattern;
      expect(after.notes).toEqual(before.notes);
      expect(after.timing.cycle).toEqual([
        [
          { offset: 0, duration: 0.5 },
          { offset: 0.5, duration: 0.5 },
        ],
      ]);
    });

    it("uses final availability-filtered timing, not discarded onsets", () => {
      const instrument = create()
        .notes([60, null, 64, null])
        .xox([1, 1, 1, 1])
        .legato();
      expect(instrument.getSchema().eventPattern.timing.cycle).toEqual([
        [
          { offset: 0, duration: 0.5 },
          { offset: 0.5, duration: 0.5 },
        ],
      ]);
    });

    it("can be enabled before or after setters and transforms", () => {
      const configure = (instrument: ReturnType<typeof create>) =>
        instrument
          .notes([60, null, 64, null])
          .xox([1, 1, 1, 1])
          .slow(2)
          .reverse();
      const early = configure(create().legato()).getSchema();
      const late = configure(create()).legato().getSchema();
      expect(early).toEqual(late);
      expect(late.eventPattern.timing).not.toEqual(
        configure(create()).getSchema().eventPattern.timing,
      );
    });

    it("fills weighted shorthand gaps without changing their onset positions", () => {
      const instrument = create().notes("0@3 2 3").slow(2);
      const before = instrument.getSchema().eventPattern;
      const after = instrument.legato().getSchema().eventPattern;
      expect(after.notes).toEqual(before.notes);
      expect(
        after.timing.cycle.map((bar) => bar.map((step) => step.offset)),
      ).toEqual(
        before.timing.cycle.map((bar) => bar.map((step) => step.offset)),
      );
      expect(after.timing.cycle).toEqual([
        [{ offset: 0, duration: expect.closeTo(1.2) }],
        [
          { offset: expect.closeTo(0.2), duration: expect.closeTo(0.4) },
          { offset: expect.closeTo(0.6), duration: expect.closeTo(0.4) },
        ],
      ]);
    });

    it("supports random pitches without changing random generation settings", () => {
      const instrument = create()
        .notes(new RandomCycle().int().steps(4).ribbon(7))
        .xox([1, 0, 1, 0]);
      const before = instrument.getSchema().eventPattern;
      const after = instrument.legato().getSchema().eventPattern;
      expect(after.notes).toEqual(before.notes);
      expect(after.timing.cycle).toEqual([
        [
          { offset: 0, duration: 0.5 },
          { offset: 0.5, duration: 0.5 },
        ],
      ]);
    });

    it("keeps chance metadata and computes durations before chance filtering", () => {
      const instrument = create()
        .xox(new RandomCycle().bin().steps(4).chance(0.5).ribbon(7))
        .slow(2);
      const before = instrument.getSchema().eventPattern;
      const after = instrument.legato().getSchema().eventPattern;
      expect(after.timing.condition).toEqual(before.timing.condition);
      expect(after.notes).toEqual(before.notes);
      expect(after.timing.cycle).toEqual([
        [
          { offset: 0, duration: 0.5 },
          { offset: 0.5, duration: 0.5 },
        ],
        [
          { offset: 0, duration: 0.5 },
          { offset: 0.5, duration: 0.5 },
        ],
      ]);
    });

    it("does not bypass the existing cross-bar continuation restriction", () => {
      expect(() =>
        create().legato().notes("<[0 2@3 4 7 6@2] [3@3 5@4]>/2"),
      ).toThrow("Speed transform would create a cross-bar continuation");
    });
  });
}

it("sampler legato retains fit, chop, looping, and clipping configuration", () => {
  const sampler = new Sampler("breaks")
    .fit(4)
    .chop(2)
    .loop()
    .clip(false)
    .direction("reverse");
  const before = sampler.getSchema();
  const after = sampler.legato().getSchema();
  const { eventPattern: beforeEvents, ...beforeProcessing } = before;
  const { eventPattern: afterEvents, ...afterProcessing } = after;
  expect(afterProcessing).toEqual(beforeProcessing);
  expect(afterEvents.sampleNames).toEqual(beforeEvents.sampleNames);
  expect(afterEvents.notes).toBeUndefined();
  expect(afterEvents.timing.cycle).toEqual([
    [{ offset: 0, duration: 2 }],
    [],
    [{ offset: 0, duration: 2 }],
    [],
  ]);
});
