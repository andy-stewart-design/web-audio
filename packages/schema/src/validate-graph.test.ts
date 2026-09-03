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

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid bpm %s",
    (bpm) => {
      const graph = schema();
      graph.bpm = bpm;

      expect(() => validateDromeGraph(graph)).toThrow(
        "[Schema] bpm must be a finite number greater than 0.",
      );
    },
  );

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
    ["blank sample name", { type: "static", cycle: [[[" "]]] }],
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

  it("accepts typed fixtures for every target instrument and region variant", () => {
    const instruments = [
      instrument(
        "main",
        {},
        {
          timing: timing([
            [
              { offset: 0, duration: 0.5 },
              { offset: 0.5, duration: 0.5 },
            ],
          ]),
          notes: { type: "static", cycle: [[[60, 64], [67]]] },
        },
      ),
      {
        ...instrument(
          "main",
          {},
          {
            timing: timing(),
            notes: randomParam({ valuesPerBar: [1], order: "reverse" }),
          },
        ),
        notesOut: { type: "midi-out" as const, device: "synth", channel: 2 },
      },
      sampler(),
      {
        ...sampler("drums", {
          timing: timing(),
          sampleNames: { type: "static", cycle: [[["pitched"]]] },
          notes: { type: "static", cycle: [[[60]]] },
          variationIndices: { type: "static", cycle: [[[0, 1]]] },
        }),
        fit: { type: "fit" as const, bars: 2 },
        region: {
          type: "static" as const,
          start: staticParam(0.25),
          duration: randomParam(),
        },
      },
      {
        ...sampler("drums", {
          timing: timing(),
          sampleNames: { type: "static", cycle: [[["bd"]]] },
          variationIndices: randomParam(),
        }),
        region: {
          type: "static" as const,
          start: staticParam(0),
          end: staticParam(1),
        },
      },
      {
        ...sampler(),
        region: {
          type: "chop" as const,
          slices: [
            { start: 0, end: 0.5 },
            { start: 0.5, end: 1 },
          ],
          sequence: { type: "static" as const, cycle: [[0, 1]] },
        },
      },
    ] satisfies DromeSchema["instruments"];
    const banks = {
      drums: {
        samples: {
          bd: { "0": [{ type: "file" as const, src: "bd.wav" }] },
          pitched: {
            "60": [
              {
                type: "sprite" as const,
                src: "piano.wav",
                start: 0.25,
                end: 0.75,
              },
            ],
          },
        },
      },
    } satisfies DromeSchema["banks"];

    expect(() =>
      validateDromeGraph(schema({}, instruments, banks)),
    ).not.toThrow();
  });

  it.each([
    [
      "invalid type",
      { type: "invalid" },
      "has an invalid audio parameter type",
    ],
    ["invalid data type", { dataType: "invalid" }, ".dataType is invalid"],
    ["invalid algorithm", { algorithm: "invalid" }, ".algorithm is invalid"],
    ["invalid order", { order: "invalid" }, ".order is invalid"],
    [
      "mixed unbounded ribbon",
      { segments: [{ seed: 1 }, { seed: 2, len: 1 }] },
      ".segments may contain an unbounded segment only by itself",
    ],
    [
      "undersized binary value map",
      { dataType: "binary", valueMap: [0] },
      ".valueMap must contain finite, safely indexable values",
    ],
    [
      "legacy chance",
      { chance: 0.5 },
      "cannot contain a timing chance condition",
    ],
  ])("rejects random patterns with %s", (_label, patch, message) => {
    const gain = randomParam();
    Object.assign(gain, patch);
    const graph = schema({
      drums: {
        gain: 1,
        transition: 0,
        effects: [{ type: "gain", gain }],
      },
    });

    expect(() => validateDromeGraph(graph)).toThrow(message);
  });

  it("rejects zero random counts that remain reachable by timing", () => {
    const event = instrument(
      "main",
      {},
      {
        timing: timing([[{ offset: 0, duration: 1 }]]),
        notes: randomParam({ valuesPerBar: [0] }),
      },
    );

    expect(() => validateDromeGraph(schema({}, [event]))).toThrow(
      "[Schema] Instrument 0.events.notes.valuesPerBar[0] must align with an empty timing bar.",
    );
  });

  it.each([
    ["type", { type: "invalid" }, '.type must be "chance"'],
    ["algorithm", { algorithm: "invalid" }, ".algorithm is invalid"],
    ["order", { order: "invalid" }, ".order is invalid"],
    ["segments", { segments: [] }, ".segments cannot be empty"],
  ])("rejects chance conditions with invalid %s", (_label, patch, message) => {
    const condition = {
      type: "chance" as const,
      probability: 0.5,
      segments: [{ seed: 0 }],
      algorithm: "xor" as const,
      order: "forward" as const,
    };
    Object.assign(condition, patch);
    const event = instrument(
      "main",
      {},
      {
        timing: { ...timing(), condition },
        notes: { type: "static", cycle: [[[60]]] },
      },
    );

    expect(() => validateDromeGraph(schema({}, [event]))).toThrow(message);
  });

  it("rejects invalid event discriminants and voice values", () => {
    const invalidNotes = instrument();
    Object.assign(invalidNotes.events.notes, { type: "invalid" });
    expect(() => validateDromeGraph(schema({}, [invalidNotes]))).toThrow(
      "[Schema] Instrument 0.events.notes.type is invalid.",
    );

    const invalidVariation = sampler("drums", {
      timing: timing(),
      sampleNames: { type: "static", cycle: [[["bd"]]] },
      variationIndices: randomParam(),
    });
    const variationIndices = invalidVariation.events.variationIndices;
    if (variationIndices === undefined) {
      throw new Error("Expected variation indices in test fixture");
    }
    Object.assign(variationIndices, { type: "invalid" });
    expect(() => validateDromeGraph(schema({}, [invalidVariation]))).toThrow(
      "[Schema] Instrument 0.events.variationIndices.type is invalid.",
    );

    const invalidNoteVoice = instrument(
      "main",
      {},
      {
        timing: timing(),
        notes: { type: "static", cycle: [[[Number.NaN]]] },
      },
    );
    expect(() => validateDromeGraph(schema({}, [invalidNoteVoice]))).toThrow(
      "[Schema] Instrument 0.events.notes.cycle[0][0][0] is not a valid note.",
    );

    const invalidVariationVoice = sampler("drums", {
      timing: timing(),
      sampleNames: { type: "static", cycle: [[["bd"]]] },
      variationIndices: { type: "static", cycle: [[[]]] },
    });
    expect(() =>
      validateDromeGraph(schema({}, [invalidVariationVoice])),
    ).toThrow(
      "[Schema] Instrument 0.events.variationIndices.cycle[0][0] must be a non-empty variation index voice group.",
    );
  });

  it("rejects invalid envelope and MIDI discriminants", () => {
    const invalidEnvelope = instrument();
    Object.assign(invalidEnvelope.gain, { type: "invalid" });
    expect(() => validateDromeGraph(schema({}, [invalidEnvelope]))).toThrow(
      '[Schema] Instrument 0.gain.type must be "envelope".',
    );

    const invalidMidiOut = {
      ...instrument(),
      notesOut: { type: "midi-out" as const, channel: 1 },
    };
    Object.assign(invalidMidiOut.notesOut, { type: "invalid" });
    expect(() => validateDromeGraph(schema({}, [invalidMidiOut]))).toThrow(
      '[Schema] Instrument 0.notesOut.type must be "midi-out".',
    );
  });

  it.each([
    [
      "waveform",
      () => Object.assign(instrument(), { waveform: "invalid" }),
      ".waveform is invalid",
    ],
    [
      "muted",
      () => Object.assign(instrument(), { muted: "yes" }),
      ".muted must be a boolean",
    ],
    [
      "loop",
      () => Object.assign(sampler(), { loop: "yes" }),
      ".loop must be a boolean",
    ],
    [
      "clip mode",
      () => Object.assign(sampler(), { clipMode: "invalid" }),
      ".clipMode is invalid",
    ],
    [
      "direction",
      () => Object.assign(sampler(), { direction: "invalid" }),
      ".direction is invalid",
    ],
    [
      "fit",
      () => Object.assign(sampler(), { fit: { type: "fit", bars: 0 } }),
      ".fit.bars must be a positive integer",
    ],
  ])("rejects an invalid instrument %s", (_label, makeInstrument, message) => {
    expect(() => validateDromeGraph(schema({}, [makeInstrument()]))).toThrow(
      message,
    );
  });

  it("rejects invalid region and effect variants", () => {
    const invalidStaticRegion = sampler();
    Object.assign(invalidStaticRegion, {
      region: {
        type: "static",
        start: staticParam(0),
        end: staticParam(1),
        duration: staticParam(1),
      },
    });
    expect(() => validateDromeGraph(schema({}, [invalidStaticRegion]))).toThrow(
      "must contain exactly one of end or duration",
    );

    const invalidChop = {
      ...sampler(),
      region: {
        type: "chop" as const,
        slices: [{ start: 0.75, end: 0.25 }],
        sequence: staticParam(0),
      },
    } satisfies SamplerSchema;
    expect(() => validateDromeGraph(schema({}, [invalidChop]))).toThrow(
      ".region.slices[0] must satisfy 0 <= start < end <= 1",
    );

    const invalidEffect = instrument();
    Object.assign(invalidEffect, { effects: [{ type: "invalid" }] });
    expect(() => validateDromeGraph(schema({}, [invalidEffect]))).toThrow(
      "[Schema] Instrument 0.effects[0].type is invalid.",
    );

    const invalidFilter = instrument();
    Object.assign(invalidFilter, {
      effects: [
        {
          type: "filter",
          filterType: "invalid",
          frequency: staticParam(1),
          q: staticParam(1),
          detune: staticParam(0),
          gain: staticParam(1),
        },
      ],
    });
    expect(() => validateDromeGraph(schema({}, [invalidFilter]))).toThrow(
      "[Schema] Instrument 0.effects[0].filterType is invalid.",
    );
  });

  it.each([
    ["minimum", { min: Number.NaN }, ".gain.min must be finite"],
    ["mode", { mode: "invalid" }, ".gain.mode is invalid"],
    [
      "numeric lane",
      { max: { type: "static", cycle: [[]] } },
      ".gain.max.cycle[0] cannot be empty",
    ],
  ])("rejects an envelope with invalid %s", (_label, patch, message) => {
    const value = instrument();
    Object.assign(value.gain, patch);

    expect(() => validateDromeGraph(schema({}, [value]))).toThrow(message);
  });

  it.each([
    ["id", { id: "" }, ".detune.id must be non-empty"],
    ["speed", { speed: [] }, ".detune.speed must contain finite values"],
    [
      "waveform",
      { waveform: ["invalid"] },
      ".detune.waveform must contain valid waveforms",
    ],
    ["phase", { phase: Number.NaN }, ".detune.phase must be finite"],
    ["flags", { norm: "yes" }, ".detune.norm and invert must be booleans"],
  ])("rejects an LFO with invalid %s", (_label, patch, message) => {
    const lfo = {
      type: "lfo" as const,
      id: "lfo",
      outputA: staticParam(0),
      outputB: staticParam(1),
      speed: [1],
      waveform: ["sine" as const],
      phase: 0,
      norm: false,
      invert: false,
    };
    Object.assign(lfo, patch);
    const value = instrument();
    Object.assign(value, { detune: lfo });

    expect(() => validateDromeGraph(schema({}, [value]))).toThrow(message);
  });

  it.each([
    ["CC", { cc: 128 }, ".detune.cc must be an integer in [0, 127]"],
    [
      "channel",
      { channel: 0 },
      ".detune.channel must be an integer in [1, 16]",
    ],
    [
      "device",
      { device: " " },
      ".detune.device must be non-empty when provided",
    ],
    [
      "range",
      { range: { min: Number.NaN, max: 1, curve: "linear" } },
      ".detune.range endpoints must be finite",
    ],
    [
      "curve",
      { range: { min: 0, max: 1, curve: "invalid" } },
      ".detune.range.curve is invalid",
    ],
    [
      "exponential range",
      { range: { min: 0, max: 1, curve: "exponential" } },
      ".detune.range exponential endpoints must be positive",
    ],
    ["default", { default: 3 }, ".detune.default must be within its range"],
  ])("rejects a MIDI CC with invalid %s", (_label, patch, message) => {
    const midiCc = {
      type: "midi-cc" as const,
      cc: 74,
      range: { min: 1, max: 2, curve: "linear" as const },
      default: 1.5,
    };
    Object.assign(midiCc, patch);
    const value = instrument();
    Object.assign(value, { detune: midiCc });

    expect(() => validateDromeGraph(schema({}, [value]))).toThrow(message);
  });

  it.each([
    [
      "channel",
      { channel: 0 },
      ".notesOut.channel must be an integer in [1, 16]",
    ],
    [
      "device",
      { device: " " },
      ".notesOut.device must be non-empty when provided",
    ],
  ])("rejects MIDI output with invalid %s", (_label, patch, message) => {
    const value = {
      ...instrument(),
      notesOut: { type: "midi-out" as const, channel: 1 },
    };
    Object.assign(value.notesOut, patch);

    expect(() => validateDromeGraph(schema({}, [value]))).toThrow(message);
  });

  it("rejects a malformed top-level graph with a scoped error", () => {
    expect(() => validateDromeGraph(null as unknown as DromeSchema)).toThrow(
      "[Schema] graph must be an object.",
    );
  });

  it.each([
    [
      "missing banks",
      () => {
        const graph = schema();
        Object.assign(graph, { banks: undefined });
        return graph;
      },
      "[Schema] banks must be an object.",
    ],
    [
      "missing buses",
      () => {
        const graph = schema();
        Object.assign(graph, { buses: undefined });
        return graph;
      },
      "[Schema] buses must be an object.",
    ],
    [
      "missing instruments",
      () => {
        const graph = schema();
        Object.assign(graph, { instruments: undefined });
        return graph;
      },
      "[Schema] instruments must be an array.",
    ],
    [
      "non-array effects",
      () => {
        const value = instrument();
        Object.assign(value, { effects: undefined });
        return schema({}, [value]);
      },
      "[Schema] Instrument 0.effects must be an array.",
    ],
    [
      "missing notes",
      () => {
        const value = instrument();
        Object.assign(value.events, { notes: undefined });
        return schema({}, [value]);
      },
      "[Schema] Instrument 0.events.notes.type is invalid.",
    ],
    [
      "non-array timing cycle",
      () => {
        const value = instrument();
        Object.assign(value.events.timing, { cycle: undefined });
        return schema({}, [value]);
      },
      "[Schema] Instrument 0.events.timing.cycle must contain at least one bar.",
    ],
  ])(
    "reports a precise path for malformed direct input: %s",
    (_label, makeGraph, message) => {
      expect(() => validateDromeGraph(makeGraph())).toThrow(message);
    },
  );

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

    expect(() =>
      validateDromeGraph(
        schema({}, [], {
          drums: {
            samples: {
              bd: {
                "0": [
                  {
                    type: "sprite",
                    src: "kit.wav",
                    start: 0.75,
                    end: 0.25,
                  },
                ],
              },
            },
          },
        }),
      ),
    ).toThrow("sprite bounds must be finite and satisfy 0 <= start < end <= 1");
  });
});
