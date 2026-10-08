import { RandomCycle } from "@web-audio/patterns";
import { describe, expect, it } from "vitest";
import { compileSynthEventState } from "@/events/compiler";
import { defaultSource, getFixedAvailability } from "@/events/geometry";
import {
  createSynthEventState,
  replaceEventTiming,
  setEventRoot,
  transformEventState,
} from "@/events/transitions";
import { decodeXoxInputGeometry } from "@/inputs/decode-xox-input";
import Synthesizer from "@/instruments/synthesizer";
import Sampler from "@/instruments/sampler";

// Retained assertions transferred from deleted authored wrappers and masked cycles.
// Expected values are independent of the native replay/compiler implementation.
describe("native coverage transferred from legacy event infrastructure", () => {
  it.each([{ values: [] }, { values: [null] }, { values: [undefined] }])(
    "rejects invalid default fallback $values at the runtime boundary",
    ({ values }) => {
      expect(() => Reflect.apply(defaultSource, undefined, [values])).toThrow(
        "nonempty fallback",
      );
    },
  );

  it("snapshots default fallback groups independently of transformed geometry", () => {
    const values: [number, ...number[]] = [0, 7];
    const source = defaultSource(values);
    values[0] = 99;
    const state = transformEventState(
      { ...createSynthEventState(), notes: source },
      { type: "slow", multiplier: 2 },
    );
    expect(state.notes).toMatchObject({
      intent: "default",
      fallback: [0, 7],
      cycle: {
        patterns: [[{ type: "event", values: [0, 7] }], [{ type: "rest" }]],
      },
    });
    expect(Object.isFrozen(values)).toBe(false);
    expect(Object.isFrozen(source.fallback)).toBe(true);
    expect(compileSynthEventState(state)).toEqual({
      timing: {
        cycle: [[{ offset: 0, duration: 1 }], []],
        condition: undefined,
      },
      notes: { type: "static", cycle: [[[0, 7]], [null]] },
    });
  });

  it("fills external timing from a rooted default chord without activating silent bars", () => {
    const slowed = transformEventState(
      setEventRoot(
        { ...createSynthEventState(), notes: defaultSource([0, 7]) },
        "a3",
      ),
      { type: "slow", multiplier: 2 },
    );
    const decoded = decodeXoxInputGeometry([[1, 1], [0], [1]]);
    const state = replaceEventTiming(slowed, decoded.cycle);
    const cycle = [
      [
        { offset: 0, duration: 0.5 },
        { offset: 0.5, duration: 0.5 },
      ],
      [],
      [{ offset: 0, duration: 1 }],
    ];
    expect(compileSynthEventState(state)).toEqual({
      timing: { cycle: [...cycle, ...cycle], condition: undefined },
      notes: {
        type: "static",
        cycle: [
          [
            [57, 64],
            [57, 64],
          ],
          [null],
          [[57, 64]],
          [
            [57, 64],
            [57, 64],
          ],
          [null],
          [[57, 64]],
        ],
      },
    });
    expect(
      compileSynthEventState({
        ...createSynthEventState(),
        notes: defaultSource([0]),
      }).notes,
    ).toEqual({ type: "static", cycle: [[[0]]] });
  });

  it.each([
    { scale: "maj", expected: [60, 62, 64, 65, 67, 69, 71] },
    { scale: "min", expected: [60, 62, 63, 65, 67, 68, 70] },
  ] as const)(
    "maps the full $scale random scale and preserves its seed",
    ({ scale, expected }) => {
      expect(
        new Synthesizer()
          .root("c4")
          .scale(scale)
          .notes(new RandomCycle().ribbon(42))
          .getSchema().eventPattern.notes,
      ).toMatchObject({
        type: "random-number",
        valueMap: expected,
        range: undefined,
        segments: [{ seed: 42 }],
      });
    },
  );

  it.each([
    {
      min: 0,
      max: 14,
      expected: [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83],
    },
    {
      min: -7,
      max: 7,
      expected: [48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71],
    },
  ])(
    "maps every degree in random range [$min, $max)",
    ({ min, max, expected }) => {
      expect(
        new Synthesizer()
          .root("c4")
          .scale("maj")
          .notes(new RandomCycle().range(min, max))
          .getSchema().eventPattern.notes,
      ).toMatchObject({
        type: "random-number",
        valueMap: expected,
        range: undefined,
      });
    },
  );

  it("retains unscaled ranges and maps binary notes to chromatic or scale offsets", () => {
    expect(
      new Synthesizer().notes(new RandomCycle().range(60, 72)).getSchema()
        .eventPattern.notes,
    ).toMatchObject({ range: { min: 60, max: 72 }, valueMap: undefined });
    expect(
      new Synthesizer()
        .root("a3")
        .notes(new RandomCycle().bin().steps(4))
        .getSchema().eventPattern.notes,
    ).toMatchObject({ valueMap: [57, 58], range: undefined });
    expect(
      new Synthesizer()
        .root("a3")
        .scale("min")
        .notes(new RandomCycle().bin().steps(4))
        .getSchema().eventPattern.notes,
    ).toMatchObject({ valueMap: [57, 59], range: undefined });
  });

  it("keeps implicit random counts, silent bars, and integer ranges separate from chance", () => {
    const schema = new Synthesizer()
      .notes(new RandomCycle().steps(2, 0, 3).int().range(48, 72))
      .getSchema().eventPattern;
    expect(schema.notes).toMatchObject({
      type: "random-number",
      valuesPerBar: [2, 0, 3],
      dataType: "integer",
      range: { min: 48, max: 72 },
    });
    expect(schema.timing.cycle.map((bar) => bar.length)).toEqual([2, 0, 3]);
    expect(schema.timing.condition).toBeUndefined();
  });

  it("accelerates unequal random timing counts and reverses its chance order once", () => {
    const synth = new Synthesizer()
      .xox(new RandomCycle().bin().steps(2, 3).chance(0.5))
      .fast(2);
    const fast = synth.getSchema().eventPattern;
    expect(fast.timing.cycle.map((bar) => bar.length)).toEqual([5]);
    expect(fast.timing.condition).toMatchObject({
      probability: 0.5,
      order: "forward",
    });
    expect(
      synth.reverse().getSchema().eventPattern.timing.condition,
    ).toMatchObject({ probability: 0.5, order: "reverse" });
    expect(synth.reverse().getSchema().eventPattern).toEqual(fast);
  });

  it("retains authored availability when materializing an entirely empty timing bar", () => {
    class InspectSampler extends Sampler {
      availability() {
        return getFixedAvailability(this._eventState.notes);
      }
    }
    const sampler = new InspectSampler("bd")
      .notes([60, null])
      .xox([0])
      .reverse();
    expect(sampler.availability()).toEqual([[false, true]]);
    expect(sampler.getSchema().eventPattern.timing.cycle).toEqual([[]]);
  });

  it("keeps slowdown rests latent while aligned, then releases them under replacement timing", () => {
    class InspectSampler extends Sampler {
      availability() {
        return getFixedAvailability(this._eventState.notes);
      }
    }
    const sampler = new InspectSampler("bd")
      .notes([60, 64])
      .xox([1, 1, 1, 1])
      .slow(2);
    expect(sampler.availability()).toEqual([
      [true, true],
      [true, true],
    ]);
    sampler.reverse();
    expect(sampler.availability()).toEqual([
      [true, true],
      [true, true],
    ]);
    sampler.xox(new RandomCycle().bin().steps(4).chance(1));
    expect(sampler.availability()).toEqual([
      [false, true, false, true],
      [false, true, false, true],
    ]);
    expect(sampler.getSchema().eventPattern.timing.cycle).toEqual([
      [
        { offset: 0.25, duration: 0.25 },
        { offset: 0.75, duration: 0.25 },
      ],
      [
        { offset: 0.25, duration: 0.25 },
        { offset: 0.75, duration: 0.25 },
      ],
    ]);
  });

  it.each([
    {
      name: "fast",
      mask: [1, 0, 1],
      apply: (s: Synthesizer) => s.fast(2),
      offsets: [[0, 1 / 3, 0.5, 5 * (1 / 6)]],
      duration: 1 / 6,
      notes: [[[60], [64], [60], [64]]],
    },
    {
      name: "slow",
      mask: [1, 0, 1, 1],
      apply: (s: Synthesizer) => s.slow(2),
      offsets: [[0], [0, 0.5]],
      duration: 0.25,
      notes: [[[60]], [[64], [60]]],
    },
    {
      name: "reverse",
      mask: [1, 0, 1],
      apply: (s: Synthesizer) => s.reverse(),
      offsets: [[0, 2 / 3]],
      duration: 1 / 3,
      notes: [[[64], [60]]],
    },
    {
      name: "stretch",
      mask: [1, 0, 1],
      apply: (s: Synthesizer) => s.stretch(2, 2),
      offsets: [
        [0, 1 / 6, 2 / 3, 5 * (1 / 6)],
        [0, 1 / 6, 2 / 3, 5 * (1 / 6)],
      ],
      duration: 1 / 6,
      notes: [
        [[60], [60], [64], [64]],
        [[60], [60], [64], [64]],
      ],
    },
  ])(
    "preserves $name masked timing and complete active value order",
    ({ mask, apply, offsets, duration, notes }) => {
      const schema = apply(
        new Synthesizer().notes([60, 64]).xox(mask),
      ).getSchema().eventPattern;
      expect(schema.timing.cycle).toEqual(
        offsets.map((bar) => bar.map((offset) => ({ offset, duration }))),
      );
      expect(schema.notes).toEqual({ type: "static", cycle: notes });
    },
  );

  it.each([
    {
      name: "Euclid before XOX",
      apply: (s: Synthesizer) => s.euclid(2, 4).xox([1, 0, 1, 1]),
      offsets: [[0, 0.75]],
      notes: [[[60], [64]]],
    },
    {
      name: "Euclid after XOX",
      apply: (s: Synthesizer) => s.xox([1, 0, 1, 1]).euclid(2, 4),
      offsets: [[0]],
      notes: [[[60]]],
    },
    {
      name: "hex after XOX",
      apply: (s: Synthesizer) => s.xox([1, 0, 1, 1]).hex("a"),
      offsets: [[0]],
      notes: [[[60]]],
    },
    {
      name: "sequence after XOX",
      apply: (s: Synthesizer) => s.xox([1, 0, 1, 1]).sequence(4, 0, 2),
      offsets: [[0], [0.5]],
      notes: [[[60]], [[60]]],
    },
  ])(
    "preserves $name rhythm order and resulting values",
    ({ apply, offsets, notes }) => {
      const schema = apply(new Synthesizer().notes([60, 64])).getSchema()
        .eventPattern;
      expect(schema.timing.cycle).toEqual(
        offsets.map((bar) => bar.map((offset) => ({ offset, duration: 0.25 }))),
      );
      expect(schema.notes).toEqual({ type: "static", cycle: notes });
    },
  );
});
