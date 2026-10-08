import { RandomCycle } from "@web-audio/patterns";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as transitions from "@/events/transitions";
import Drome from "@/index";
import Sampler from "../sampler";
import Synthesizer from "../synthesizer";

vi.mock("@/events/transitions", { spy: true });
afterEach(() => vi.restoreAllMocks());

class InspectSampler extends Sampler {
  inspectEventState() {
    return this._eventState;
  }
}

class InspectSynth extends Synthesizer {
  inspectEventState() {
    return this._eventState;
  }
}

function assertFrozen(value: unknown) {
  if (value === null || typeof value !== "object") return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) assertFrozen(child);
}

const setters = [
  { method: "notes", lane: "notes", apply: (s: InspectSampler) => s.notes(0) },
  {
    method: "name",
    lane: "sampleNames",
    apply: (s: InspectSampler) => s.name("bd"),
  },
  {
    method: "variation",
    lane: "variation",
    apply: (s: InspectSampler) => s.variation(0),
  },
  { method: "var", lane: "variation", apply: (s: InspectSampler) => s.var(0) },
] as const;

const constructors = [
  { name: "synth", create: () => new InspectSynth() },
  { name: "sampler", create: () => new InspectSampler("bd") },
];

describe("native public event setters", () => {
  it.each(constructors)(
    "$name stores one frozen native state and no legacy event fields",
    ({ create }) => {
      const instrument = create();
      const state = instrument.inspectEventState();
      assertFrozen(state);
      expect(state.notes.intent).toBe("default");
      expect(state.timing.intent).toBe("implicit");
      expect(create().inspectEventState()).not.toBe(state);
      for (const field of ["_pitches", "_timing", "_sampleNames", "_variation"])
        expect(instrument).not.toHaveProperty(field);
      expect(state).not.toHaveProperty("expression");
    },
  );

  it.each(setters)(
    "$method replaces equal defaults with authored intent without changing other lanes",
    ({ lane, apply }) => {
      const sampler = new InspectSampler("bd").xox([1, 0, 1]);
      const before = sampler.inspectEventState();
      expect(apply(sampler)).toBe(sampler);
      const after = sampler.inspectEventState();
      expect(after[lane]?.intent).toBe("authored");
      for (const key of [
        "notes",
        "sampleNames",
        "variation",
        "pitch",
        "timing",
      ] as const) {
        if (key !== lane) expect(after[key]).toEqual(before[key]);
      }
      expect(before[lane]?.intent).toBe("default");
      assertFrozen(after);
    },
  );

  it("synth equal-value notes replace default intent and preserve explicit timing", () => {
    const synth = new InspectSynth().xox([1, 0, 1]);
    const before = synth.inspectEventState();
    expect(synth.notes(60)).toBe(synth);
    expect(synth.inspectEventState().notes.intent).toBe("authored");
    expect(synth.inspectEventState().timing).toEqual(before.timing);
    expect(synth.inspectEventState().pitch).toEqual(before.pitch);
    expect(before.notes.intent).toBe("default");
  });

  it("preserves structured bars, nullable note slots, voice order, and empty-chord silence", () => {
    const synth = new InspectSynth().notes(
      [60, [64, null, undefined, 64], [], undefined],
      [],
    );
    expect(synth.inspectEventState().notes.cycle).toEqual({
      type: "static-event-cycle",
      patterns: [
        [
          { type: "event", values: [60] },
          { type: "event", values: [64, 64] },
          { type: "rest" },
          { type: "rest" },
        ],
        [{ type: "rest" }],
      ],
    });
    expect(synth.inspectEventState().notes).toMatchObject({
      intent: "authored",
      zeroWidthPatterns: [false, true],
    });
    const sampler = new InspectSampler(undefined)
      .name([[" bd ", "bd"], null, "sd"], [])
      .var([[0, 0], null, 1], []);
    expect(sampler.getSchema().eventPattern.sampleNames).toEqual({
      type: "static",
      cycle: [[["bd", "bd"], ["sd"]], [null]],
    });
    expect(sampler.getSchema().eventPattern.variationIndices).toEqual({
      type: "static",
      cycle: [[[0, 0], [1]], [null]],
    });
  });

  it("does not tighten sample aliases or interpret a single name string as shorthand yet", () => {
    expect(
      new InspectSampler(undefined)
        .name("two words", "bd:2", "kick-drum")
        .getSchema().eventPattern.sampleNames,
    ).toEqual({
      type: "static",
      cycle: [[["two words"]], [["bd:2"]], [["kick-drum"]]],
    });
  });

  it("snapshots static arrays and random sources without freezing or aliasing caller data", () => {
    const chord = [60, 64];
    const names = ["bd", "sd"];
    const values = [0, 2];
    const sampler = new InspectSampler("bd")
      .notes([chord])
      .name(names)
      .var(values);
    const before = sampler.getSchema().eventPattern;
    chord[0] = 99;
    names[0] = "hh";
    values[0] = 99;
    expect([chord, names, values].some(Object.isFrozen)).toBe(false);
    expect(sampler.getSchema().eventPattern).toEqual(before);

    const notes = new RandomCycle().int().steps(2, 0).range(-2, 4).ribbon(7);
    const variation = new RandomCycle().int().steps(3, 0).ribbon(11);
    const rhythm = new RandomCycle().bin().steps(4, 0).chance(0.25).ribbon(13);
    sampler.notes(notes).var(variation).xox(rhythm);
    const snapshot = sampler.getSchema().eventPattern;
    const state = sampler.inspectEventState();
    expect(state.notes.cycle.type).toBe("random-event-cycle");
    expect(state.variation.cycle.type).toBe("random-event-cycle");
    expect(state.timing.condition).toMatchObject({
      probability: 0.25,
      segments: [{ seed: 13 }],
    });
    notes.steps(1).range(0, 1).ribbon(99);
    variation.steps(1).ribbon(99);
    rhythm.steps(1).chance(1).ribbon(99);
    expect(sampler.getSchema().eventPattern).toEqual(snapshot);
    expect(sampler.inspectEventState()).toBe(state);
    assertFrozen(state);
  });

  it.each(constructors)(
    "$name root/scale updates preserve lanes and record explicit pitch intent",
    ({ create }) => {
      const instrument = create().notes([0, -1, 2]).xox([1, 0, 1]);
      const before = instrument.inspectEventState();
      expect(instrument.root("c4").scale("maj")).toBe(instrument);
      const after = instrument.inspectEventState();
      expect(after.pitch).toEqual({
        root: 60,
        scale: [0, 2, 4, 5, 7, 9, 11],
        hasRequestedTransform: true,
      });
      expect(after.notes).toEqual(before.notes);
      expect(after.timing).toEqual(before.timing);
      expect(
        new InspectSampler("bd").root(0).getSchema().eventPattern.notes,
      ).toEqual({ type: "static", cycle: [[[0]]] });
    },
  );

  it.each(constructors)(
    "$name rejects invalid notes/timing eagerly without replacing state",
    ({ create }) => {
      const instrument = create().notes([60, 64]).xox([1, 0, 1]);
      const before = instrument.inspectEventState();
      const schema = instrument.getSchema();
      const invalid = [
        () => instrument.notes(),
        () => instrument.notes(NaN),
        () => instrument.notes(Infinity),
        () => instrument.xox(),
        () => instrument.xox(NaN),
        () => instrument.xox(new RandomCycle().int()),
        () => instrument.notes(new RandomCycle().quant(0)),
      ];
      for (const setter of invalid) {
        expect(setter).toThrow();
        expect(instrument.inspectEventState()).toBe(before);
        expect(instrument.getSchema()).toEqual(schema);
      }
    },
  );

  it("preserves sampler validation diagnostics without replacing state on errors", () => {
    const sampler = new InspectSampler("bd").var([0, 1]);
    const before = sampler.inspectEventState();
    const cases = [
      {
        apply: () => sampler.name(),
        error: "[Sampler] name() requires at least one pattern.",
      },
      {
        apply: () => sampler.name(" "),
        error: "[Sampler] name() sample names must be non-empty.",
      },
      {
        apply: () => sampler.name([[]]),
        error: "[Sampler] name() simultaneous voice groups cannot be empty.",
      },
      {
        apply: () => sampler.variation(),
        error: "[Sampler] variation() requires at least one pattern.",
      },
      {
        apply: () => sampler.var(NaN),
        error: "[Sampler] variation() values must be finite numbers.",
      },
      {
        apply: () => sampler.variation([[]]),
        error:
          "[Sampler] variation() simultaneous voice groups cannot be empty.",
      },
    ];
    for (const { apply, error } of cases) {
      expect(apply).toThrow(error);
      expect(sampler.inspectEventState()).toBe(before);
    }
  });
});

describe("native facade transforms and reads", () => {
  const contexts = [
    ...constructors,
    {
      name: "generated sampler",
      create: () => new InspectSampler("bd").chop(2).fit(4),
    },
  ];
  const transforms = [
    {
      operation: { type: "reverse" },
      apply: (s: InspectSynth | InspectSampler) => s.reverse(),
    },
    {
      operation: { type: "fast", multiplier: 2 },
      apply: (s: InspectSynth | InspectSampler) => s.fast(2),
    },
    {
      operation: { type: "slow", multiplier: 2 },
      apply: (s: InspectSynth | InspectSampler) => s.slow(2),
    },
    {
      operation: { type: "stretch", bars: 2, steps: 2 },
      apply: (s: InspectSynth | InspectSampler) => s.stretch(2, 2),
    },
  ] as const;
  for (const { name, create } of contexts) {
    it.each(transforms)(
      `${name} $operation.type enters exactly one native transition and leaves processing unchanged`,
      ({ operation, apply }) => {
        const instrument = create()
          .notes([60, 64])
          .xox([1, 0, 1])
          .detune([0, 100])
          .gain([0.25, 0.5])
          .adsr(0.1, 0.2, 0.3, 0.4);
        if (instrument instanceof InspectSampler)
          instrument.name(["bd", "sd"]).var([0, 1]);
        const before = instrument.inspectEventState();
        const { eventPattern: beforeEvents, ...beforeProcessing } =
          instrument.getSchema();
        const transform = vi.mocked(transitions.transformEventState);
        transform.mockClear();
        expect(apply(instrument)).toBe(instrument);
        expect(transform).toHaveBeenCalledTimes(1);
        expect(transform.mock.calls[0][0]).toBe(before);
        expect(transform.mock.calls[0][1]).toEqual(operation);
        if (name === "generated sampler") {
          expect(transform.mock.calls[0][2]).toEqual({
            timingOverride: {
              cycle: [
                [{ offset: 0, duration: 2 }],
                [],
                [{ offset: 0, duration: 2 }],
                [],
              ],
            },
          });
        }
        const after = instrument.inspectEventState();
        assertFrozen(after);
        const { eventPattern: afterEvents, ...afterProcessing } =
          instrument.getSchema();
        expect(afterProcessing).toEqual(beforeProcessing);
        expect(afterEvents).not.toEqual(beforeEvents);
        expect(instrument.getSchema()).toEqual({
          eventPattern: afterEvents,
          ...afterProcessing,
        });
        expect(instrument.inspectEventState()).toBe(after);
        expect(transform).toHaveBeenCalledTimes(1);
      },
    );
  }

  it("warns once per distinct authored name, including names with no surviving timing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const d = new Drome();
    d.loadSamples({ bd: ["bd.wav"] });
    d.sample()
      .bank("user")
      .name([["missing", "missing"], null, "other"])
      .xox([0])
      .getSchema();
    expect(warn.mock.calls).toEqual([
      [
        '[Sampler] Sample "missing" not found in bank "user". This sampler may not produce audio.',
      ],
      [
        '[Sampler] Sample "other" not found in bank "user". This sampler may not produce audio.',
      ],
    ]);
  });

  it("warns from default fallback names even when transformed default timing is silent", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const d = new Drome();
    d.loadSamples({ bd: ["bd.wav"] });
    d.sample("missing").bank("user").slow(2).reverse().xox([0]).getSchema();
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      '[Sampler] Sample "missing" not found in bank "user". This sampler may not produce audio.',
    );
  });
});

const rhythms = [
  {
    name: "numeric hex",
    apply: (s: InspectSynth | InspectSampler) => s.hex(0xf),
    offsets: [[0, 0.25, 0.5, 0.75]],
    duration: 0.25,
  },
  {
    name: "multi-bar hex with silence",
    apply: (s: InspectSynth | InspectSampler) => s.hex("a5", "0"),
    offsets: [[0, 0.25, 0.625, 0.875], []],
    duration: 0.125,
  },
  {
    name: "multi-bar rotated Euclid",
    apply: (s: InspectSynth | InspectSampler) => s.euclid([3, 4], 8, [0, 1]),
    offsets: [
      [0, 0.375, 0.75],
      [0.125, 0.375, 0.625, 0.875],
    ],
    duration: 0.125,
  },
  {
    name: "sequence bars",
    apply: (s: InspectSynth | InspectSampler) => s.sequence(4, [0, 2], 1),
    offsets: [[0, 0.5], [0.25]],
    duration: 0.25,
  },
  {
    name: "empty Euclid",
    apply: (s: InspectSynth | InspectSampler) => s.euclid(5, 3),
    offsets: [[]],
    duration: 1,
  },
  {
    name: "zero-step sequence",
    apply: (s: InspectSynth | InspectSampler) => s.sequence(0, 1),
    offsets: [[]],
    duration: 1,
  },
  {
    name: "empty hex bar",
    apply: (s: InspectSynth | InspectSampler) => s.hex(""),
    offsets: [[]],
    duration: 1,
  },
];

for (const { name, create } of constructors) {
  describe(`${name} native rhythm setters`, () => {
    it.each(rhythms)(
      "$name preserves generator geometry and later value replacement",
      ({ apply, offsets, duration }) => {
        const instrument = create();
        expect(apply(instrument)).toBe(instrument);
        const state = instrument.inspectEventState();
        expect(state.timing.intent).toBe("explicit");
        expect(instrument.notes(60)).toBe(instrument);
        expect(instrument.inspectEventState().timing).toEqual(state.timing);
        expect(instrument.getSchema().eventPattern.timing.cycle).toEqual(
          offsets.map((bar) => bar.map((offset) => ({ offset, duration }))),
        );
      },
    );

    it("rejects empty generator input and oversized masks without replacing state", () => {
      const instrument = create().notes([60, 64]).xox([1, 0, 1]);
      const state = instrument.inspectEventState();
      const schema = instrument.getSchema();
      const invalid = [
        () => instrument.hex(),
        () => instrument.euclid([], 4, []),
        () => instrument.sequence(4),
        () => instrument.hex(...Array<string>(1025).fill("f")),
        () => instrument.euclid(Array<number>(1025).fill(2), 4),
        () => instrument.sequence(4, ...Array<number>(1025).fill(0)),
        () => instrument.hex("f".repeat(4096)),
      ];
      for (const setter of invalid) {
        expect(setter).toThrow();
        expect(instrument.inspectEventState()).toBe(state);
        expect(instrument.getSchema()).toEqual(schema);
      }
    });

    it("composes all fixed rhythm methods against prior binary steps in call order", () => {
      const instrument = create().xox([1, 0]).hex("f");
      expect(instrument.getSchema().eventPattern.timing.cycle).toEqual([
        [
          { offset: 0, duration: 0.25 },
          { offset: 0.5, duration: 0.25 },
        ],
      ]);
      instrument.euclid(3, 8);
      expect(instrument.getSchema().eventPattern.timing.cycle).toEqual([
        [
          { offset: 0, duration: 0.125 },
          { offset: 0.75, duration: 0.125 },
        ],
      ]);
      instrument.sequence(4, [0, 1, 2, 3]);
      expect(instrument.getSchema().eventPattern.timing.cycle).toEqual([
        [{ offset: 0, duration: 0.25 }],
      ]);
    });

    it("random rhythm replaces prior masks and fixed generators retain one chance condition", () => {
      const instrument = create()
        .xox([0])
        .xox(new RandomCycle().bin().steps(4).chance(0.25).ribbon(7))
        .hex("a")
        .euclid(4, 4)
        .sequence(4, [0, 1, 2, 3]);
      expect(instrument.getSchema().eventPattern.timing).toEqual({
        cycle: [
          [
            { offset: 0, duration: 0.25 },
            { offset: 0.5, duration: 0.25 },
          ],
        ],
        condition: {
          type: "chance",
          probability: 0.25,
          segments: [{ seed: 7 }],
          algorithm: "xor",
          order: "forward",
        },
      });
    });
  });
}
