import { describe, expect, it } from "vitest";
import type {
  BankSchema,
  DromeSchema,
  EffectSchema,
  RandomNumberPattern,
  SamplerSchema,
  StaticValuePattern,
  SynthEventSchema,
  SynthesizerSchema,
  TimingSchema,
} from "./index";
import { validateDromeGraph } from "./validate-graph";

function staticParam(value: number): StaticValuePattern<number> {
  return {
    type: "static",
    cycle: [[value]],
  };
}

function randomParam(
  overrides: Partial<RandomNumberPattern> = {},
): RandomNumberPattern {
  return {
    type: "random-number",
    valuesPerBar: [1],
    dataType: "float",
    segments: [{ seed: 0 }],
    range: undefined,
    quantValue: undefined,
    algorithm: "xor",
    order: "forward",
    ...overrides,
  };
}

function timing(
  cycle: TimingSchema["cycle"] = [[{ offset: 0, duration: 1 }]],
): TimingSchema {
  return { cycle };
}

function envelope() {
  return {
    type: "envelope" as const,
    min: 0,
    max: staticParam(1),
    a: staticParam(0.01),
    d: staticParam(0),
    s: staticParam(1),
    r: staticParam(0.01),
    mode: "bleed" as const,
  };
}

function instrument(
  route = "main",
  sends: Record<string, number> = {},
  events: SynthEventSchema = {
    timing: timing(),
    notes: { type: "static", cycle: [[[60]]] },
  },
): SynthesizerSchema {
  return {
    type: "synthesizer",
    waveform: "sine",
    events,
    gain: envelope(),
    effects: [],
    detune: staticParam(0),
    muted: false,
    route,
    sends,
  };
}

function sampler(
  bank = "drums",
  events: SamplerSchema["events"] = {
    timing: timing(),
    sampleNames: { type: "static", cycle: [[["bd"]]] },
  },
): SamplerSchema {
  return {
    type: "sampler",
    bank,
    events,
    gain: envelope(),
    effects: [],
    detune: staticParam(0),
    muted: false,
    route: "main",
    sends: {},
    fit: null,
    region: null,
    loop: false,
    clipMode: "clipped",
    direction: "forward",
  };
}

function schema(
  buses: DromeSchema["buses"] = {},
  instruments: DromeSchema["instruments"] = [],
  banks: DromeSchema["banks"] = {},
): DromeSchema {
  return { bpm: undefined, buses, instruments, banks };
}

const validBank: BankSchema = {
  samples: {
    bd: { "0": [{ type: "file", src: "bd.wav" }] },
  },
};

describe("validateDromeGraph", () => {
  it("accepts a canonical graph", () => {
    expect(() =>
      validateDromeGraph(
        schema(
          {
            drums: { gain: 0.8, transition: 0, effects: [] },
            verb: { gain: 0.5, transition: 0, effects: [] },
          },
          [instrument("drums", { verb: 0.2 })],
        ),
      ),
    ).not.toThrow();
  });

  it.each(["", " drums "])("rejects non-canonical bus name %j", (name) => {
    expect(() =>
      validateDromeGraph(
        schema({ [name]: { gain: 1, transition: 0, effects: [] } }),
      ),
    ).toThrow(`[Schema] Bus name "${name}" is not canonical.`);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid bus gain %s",
    (gain) => {
      expect(() =>
        validateDromeGraph(
          schema({ drums: { gain, transition: 0, effects: [] } }),
        ),
      ).toThrow(
        '[Schema] Bus "drums" gain must be a finite number greater than or equal to 0.',
      );
    },
  );

  it.each([-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid bus transition %s",
    (transition) => {
      expect(() =>
        validateDromeGraph(
          schema({ drums: { gain: 1, transition, effects: [] } }),
        ),
      ).toThrow(
        '[Schema] Bus "drums" transition must be a finite number in [0, 1].',
      );
    },
  );

  it("rejects effects on main", () => {
    expect(() =>
      validateDromeGraph(
        schema({
          main: {
            gain: 1,
            transition: 0,
            effects: [{ type: "gain", gain: staticParam(1) }],
          },
        }),
      ),
    ).toThrow("[Schema] Effects on main are not supported in the bus MVP.");
  });

  it("accepts multi-bar and multi-step static bus effect parameters", () => {
    const effect: EffectSchema = {
      type: "gain",
      gain: {
        ...staticParam(1),
        cycle: [[1, 0.5], [0.25]],
      },
    };

    expect(() =>
      validateDromeGraph(
        schema({ drums: { gain: 1, transition: 0, effects: [effect] } }),
      ),
    ).not.toThrow();
  });

  it.each([
    ["empty cycle", []],
    ["empty row", [[]]],
    ["non-finite first value", [[Number.NaN]]],
  ])("rejects a static bus parameter with %s", (_label, cycle) => {
    const effect: EffectSchema = {
      type: "gain",
      gain: { ...staticParam(1), cycle },
    };

    expect(() =>
      validateDromeGraph(
        schema({ drums: { gain: 1, transition: 0, effects: [effect] } }),
      ),
    ).toThrow(/\[Schema\] Bus "drums" effects\[0\]\.gain/);
  });

  it("accepts structurally safe random bus parameters, including reversed ranges", () => {
    const effect: EffectSchema = {
      type: "gain",
      gain: randomParam({
        segments: [
          { seed: 1, len: 2 },
          { seed: 2, len: 3 },
        ],
        range: { min: 1, max: -1 },
        quantValue: 0.25,
      }),
    };

    expect(() =>
      validateDromeGraph(
        schema({ drums: { gain: 1, transition: 0, effects: [effect] } }),
      ),
    ).not.toThrow();
  });

  it.each([
    [
      "empty segments",
      randomParam({ segments: [] }),
      "segments cannot be empty",
    ],
    [
      "non-finite seed",
      randomParam({ segments: [{ seed: Number.NaN }] }),
      "segments seeds must be finite",
    ],
    [
      "fractional segment length",
      randomParam({ segments: [{ seed: 1, len: 1.5 }] }),
      "segments lengths must be positive finite integers",
    ],
    [
      "non-finite range span",
      randomParam({ range: { min: -Number.MAX_VALUE, max: Number.MAX_VALUE } }),
      "range endpoints and span must be finite",
    ],
    [
      "zero quantization",
      randomParam({ quantValue: 0 }),
      "quantValue must be a positive finite number",
    ],
    [
      "empty values-per-bar cycle",
      randomParam({ valuesPerBar: [] }),
      "valuesPerBar must contain finite non-negative integers",
    ],
    [
      "empty value map",
      randomParam({ valueMap: [] }),
      "valueMap must contain finite, safely indexable values",
    ],
    [
      "negative values-per-bar count",
      randomParam({ valuesPerBar: [-1] }),
      "valuesPerBar must contain finite non-negative integers",
    ],
  ])("rejects random bus parameters with %s", (_label, gain, message) => {
    const effect: EffectSchema = { type: "gain", gain };

    expect(() =>
      validateDromeGraph(
        schema({ drums: { gain: 1, transition: 0, effects: [effect] } }),
      ),
    ).toThrow(`[Schema] Bus "drums" effects[0].gain.${message}.`);
  });

  it("rejects unresolved and non-canonical routes", () => {
    expect(() => validateDromeGraph(schema({}, [instrument("drums")]))).toThrow(
      '[Schema] Instrument 0 route "drums" does not reference a declared bus.',
    );
    expect(() =>
      validateDromeGraph(schema({}, [instrument(" main ")])),
    ).toThrow('[Schema] Instrument 0 route " main " is not canonical.');
  });

  it("rejects main, unresolved, non-canonical, and invalid sends", () => {
    expect(() =>
      validateDromeGraph(schema({}, [instrument("main", { main: 0.2 })])),
    ).toThrow("[Schema] Instrument 0 send cannot target main.");
    expect(() =>
      validateDromeGraph(schema({}, [instrument("main", { verb: 0.2 })])),
    ).toThrow(
      '[Schema] Instrument 0 send "verb" does not reference a declared bus.',
    );
    expect(() =>
      validateDromeGraph(
        schema({ verb: { gain: 1, transition: 0, effects: [] } }, [
          instrument("main", { " verb ": 0.2 }),
        ]),
      ),
    ).toThrow('[Schema] Instrument 0 send target " verb " is not canonical.');
    expect(() =>
      validateDromeGraph(
        schema({ verb: { gain: 1, transition: 0, effects: [] } }, [
          instrument("main", { verb: 2 }),
        ]),
      ),
    ).toThrow(
      '[Schema] Instrument 0 send "verb" amount must be a finite number in [0, 1].',
    );
  });

  it("accepts complete synth and sampler plans with missing external resources", () => {
    expect(() =>
      validateDromeGraph(
        schema({}, [instrument(), sampler("missing")], { drums: validBank }),
      ),
    ).not.toThrow();
  });

  it("accepts empty timing bars and durations longer than one bar", () => {
    const event = instrument(
      "main",
      {},
      {
        timing: timing([[], [{ offset: 0, duration: 4 }]]),
        notes: { type: "static", cycle: [[[60]], [[67]]] },
      },
    );

    expect(() => validateDromeGraph(schema({}, [event]))).not.toThrow();
  });

  it.each([
    ["empty cycle", []],
    ["offset below zero", [[{ offset: -0.1, duration: 1 }]]],
    ["offset at one", [[{ offset: 1, duration: 1 }]]],
    ["zero duration", [[{ offset: 0, duration: 0 }]]],
    [
      "unsorted offsets",
      [
        [
          { offset: 0.5, duration: 1 },
          { offset: 0.25, duration: 1 },
        ],
      ],
    ],
    [
      "duplicate offsets",
      [
        [
          { offset: 0.25, duration: 1 },
          { offset: 0.25, duration: 1 },
        ],
      ],
    ],
  ])("rejects timing with %s", (_label, cycle) => {
    const event = instrument(
      "main",
      {},
      {
        timing: timing(cycle as TimingSchema["cycle"]),
        notes: { type: "static", cycle: [[[60]]] },
      },
    );

    expect(() => validateDromeGraph(schema({}, [event]))).toThrow(
      "[Schema] Instrument 0.events.timing.cycle",
    );
  });

  it("validates a chance condition independently from event values", () => {
    const event = instrument(
      "main",
      {},
      {
        timing: {
          cycle: [[{ offset: 0, duration: 1 }]],
          condition: {
            type: "chance",
            probability: 0.5,
            segments: [{ seed: 42 }],
            algorithm: "mulberry",
            order: "reverse",
          },
        },
        notes: randomParam({ valuesPerBar: [1] }),
      },
    );

    expect(() => validateDromeGraph(schema({}, [event]))).not.toThrow();
    expect(() =>
      validateDromeGraph(
        schema({}, [
          instrument(
            "main",
            {},
            {
              ...event.events,
              timing: {
                ...event.events.timing,
                condition: {
                  ...event.events.timing.condition!,
                  probability: 1.1,
                },
              },
            },
          ),
        ]),
      ),
    ).toThrow(
      "[Schema] Instrument 0.events.timing.condition.probability must be finite and in [0, 1].",
    );
  });

  it("accepts valid static and random event values", () => {
    const samplerEvent = {
      timing: timing([[], [{ offset: 0, duration: 1 }]]),
      sampleNames: {
        type: "static" as const,
        cycle: [[null], [["bd"]]],
      },
      notes: randomParam({ valuesPerBar: [0, 1] }),
      variationIndices: {
        type: "static" as const,
        cycle: [[null], [[0, 1]]],
      },
    } satisfies SamplerSchema["events"];

    expect(() =>
      validateDromeGraph(schema({}, [sampler("missing", samplerEvent)])),
    ).not.toThrow();
  });

  it("rejects event rests that do not align with timing", () => {
    const event = sampler("missing", {
      timing: timing([
        [{ offset: 0, duration: 1 }],
        [{ offset: 0, duration: 1 }],
      ]),
      sampleNames: {
        type: "static",
        cycle: [[["bd"]], [null]],
      },
    });

    expect(() => validateDromeGraph(schema({}, [event]))).toThrow(
      "[Schema] Instrument 0.events.sampleNames.cycle[1] silent bar must align with an empty timing bar.",
    );
  });

  it.each([
    ["all-silent sample names", { type: "static", cycle: [[null]] }],
    ["empty sample voice group", { type: "static", cycle: [[[]]] }],
    [
      "null beside an active group",
      { type: "static", cycle: [[["bd"], null]] },
    ],
  ])("rejects invalid sample-name voices: %s", (_label, sampleNames) => {
    const event = sampler("missing", {
      timing: timing(),
      sampleNames: sampleNames as SamplerSchema["events"]["sampleNames"],
    });

    expect(() => validateDromeGraph(schema({}, [event]))).toThrow(
      "[Schema] Instrument 0.events.sampleNames",
    );
  });

  it("validates processing, region, and bank branches", () => {
    const lfo = {
      type: "lfo" as const,
      id: "lfo-1",
      outputA: staticParam(0),
      outputB: randomParam(),
      speed: [1, 2],
      waveform: ["sine" as const, "triangle" as const],
      phase: 0,
      norm: false,
      invert: false,
    };
    const midiCc = {
      type: "midi-cc" as const,
      cc: 74,
      channel: 1,
      range: { min: 0, max: 1, curve: "linear" as const },
      default: 0.5,
    };
    const effect: EffectSchema = {
      type: "filter",
      filterType: "lp",
      frequency: lfo,
      q: midiCc,
      detune: staticParam(0),
      gain: staticParam(1),
    };
    const samplerSchema = {
      ...sampler(),
      effects: [effect],
      region: {
        type: "static" as const,
        start: staticParam(0),
        end: staticParam(1),
      },
    } satisfies SamplerSchema;

    expect(() =>
      validateDromeGraph(
        schema(
          { verb: { gain: 1, transition: 0, effects: [effect] } },
          [{ ...instrument("verb"), effects: [effect] }, samplerSchema],
          { drums: validBank },
        ),
      ),
    ).not.toThrow();
  });

  it("rejects an empty declared bank and malformed source entries", () => {
    expect(() =>
      validateDromeGraph(schema({}, [], { empty: { samples: {} } })),
    ).toThrow('[Schema] Bank "empty" must contain samples.');

    expect(() =>
      validateDromeGraph(
        schema({}, [], {
          drums: {
            samples: { bd: { "0": [{ type: "file", src: "" }] } },
          },
        }),
      ),
    ).toThrow(
      '[Schema] banks["drums"].samples["bd"]["0"][0].src must be non-empty.',
    );
  });
});
