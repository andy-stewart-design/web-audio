import type {
  BankSchema,
  DromeSchema,
  EnvelopeSchema,
  NotesSchema,
  RandomSchema,
  SamplerSchema,
  StaticSchema,
  StaticSchemaValue,
  SynthesizerSchema,
} from "@web-audio/schema";

// These factories centralize the current baseline schema while PR 1 replaces
// its representation. Behavior-specific tests should still construct unusual
// or intentionally invalid shapes locally.

function staticNumberPattern(values: number[] = [0]): StaticSchema {
  return {
    type: "static",
    polyphonic: false,
    cycle: [
      values.map((value, stepIndex) => ({
        value,
        offset: values.length === 1 ? 0 : stepIndex / values.length,
        duration: 1 / values.length,
        stepIndex,
      })),
    ],
  };
}

function staticNumberBars(...values: number[]): StaticSchema {
  return {
    type: "static",
    polyphonic: false,
    cycle: values.map((value) => [
      { value, offset: 0, duration: 1, stepIndex: 0 },
    ]),
  };
}

function randomNumberPattern(
  overrides: {
    algorithm?: RandomSchema["algorithm"];
    chance?: RandomSchema["chance"];
    dataType?: RandomSchema["dataType"];
    grid?: RandomSchema["grid"];
    quantValue?: RandomSchema["quantValue"];
    range?: RandomSchema["range"];
    segments?: RandomSchema["segments"];
    valueMap?: RandomSchema["valueMap"];
  } = {},
): RandomSchema {
  return {
    type: "random",
    algorithm: "xor",
    dataType: "float",
    grid: staticNumberPattern([1]),
    quantValue: undefined,
    range: undefined,
    segments: [{ seed: 0 }],
    ...overrides,
  };
}

function timingBar(
  steps: StaticSchemaValue[] = [
    { value: 1, offset: 0, duration: 1, stepIndex: 0 },
  ],
) {
  return steps;
}

function timingSchema(bars: StaticSchemaValue[][] = [timingBar()]) {
  return {
    type: "static",
    polyphonic: false,
    cycle: bars,
  } satisfies StaticSchema;
}

function chanceCondition(
  probability = 1,
  bars: StaticSchemaValue[][] = [timingBar()],
) {
  return randomNumberPattern({
    algorithm: "xor",
    chance: probability,
    dataType: "binary",
    grid: timingSchema(bars),
  });
}

function defaultEnvelope(): EnvelopeSchema {
  return {
    type: "envelope",
    min: 0,
    max: staticNumberPattern([1]),
    a: staticNumberPattern([0]),
    d: staticNumberPattern([0]),
    s: staticNumberPattern([1]),
    r: staticNumberPattern([0]),
    mode: "bleed",
  };
}

function defaultNotes(): NotesSchema {
  return {
    source: staticNumberPattern([60]),
  };
}

type SynthSchemaOverrides = {
  waveform?: SynthesizerSchema["waveform"];
  notes?: SynthesizerSchema["notes"];
  notesOut?: SynthesizerSchema["notesOut"];
  detune?: SynthesizerSchema["detune"];
  gain?: SynthesizerSchema["gain"];
  effects?: SynthesizerSchema["effects"];
  muted?: SynthesizerSchema["muted"];
  route?: SynthesizerSchema["route"];
  sends?: SynthesizerSchema["sends"];
};

function defaultSynthSchema(overrides: SynthSchemaOverrides = {}) {
  return {
    type: "synthesizer",
    waveform: "sine",
    notes: defaultNotes(),
    detune: staticNumberPattern([0]),
    gain: defaultEnvelope(),
    effects: [],
    muted: false,
    route: "main",
    sends: {},
    ...overrides,
  } satisfies SynthesizerSchema;
}

type SamplerSchemaOverrides = {
  bank?: SamplerSchema["bank"];
  sample?: SamplerSchema["sample"];
  variation?: SamplerSchema["variation"];
  notes?: SamplerSchema["notes"];
  fit?: SamplerSchema["fit"];
  region?: SamplerSchema["region"];
  sourceKeys?: SamplerSchema["sourceKeys"];
  detune?: SamplerSchema["detune"];
  gain?: SamplerSchema["gain"];
  effects?: SamplerSchema["effects"];
  muted?: SamplerSchema["muted"];
  route?: SamplerSchema["route"];
  sends?: SamplerSchema["sends"];
  loop?: SamplerSchema["loop"];
  clipMode?: SamplerSchema["clipMode"];
  direction?: SamplerSchema["direction"];
};

function defaultSamplerSchema(overrides: SamplerSchemaOverrides = {}) {
  return {
    type: "sampler",
    bank: "kit",
    sample: "bd",
    variation: staticNumberPattern([0]),
    notes: {
      source: staticNumberPattern([0]),
    },
    fit: null,
    region: null,
    sourceKeys: [0],
    detune: staticNumberPattern([0]),
    gain: defaultEnvelope(),
    effects: [],
    muted: false,
    route: "main",
    sends: {},
    loop: false,
    clipMode: "clipped",
    direction: "forward",
    ...overrides,
  } satisfies SamplerSchema;
}

function fileBank(
  bank = "kit",
  sample = "bd",
  sources = ["https://example.com/bd.wav"],
) {
  return {
    [bank]: {
      samples: {
        [sample]: {
          "0": sources.map((src) => ({ type: "file" as const, src })),
        },
      },
    },
  } satisfies Record<string, BankSchema>;
}

function spriteBank(
  bank = "kit",
  sample = "bd",
  source = "https://example.com/kit.wav",
  regions: [number, number][] = [[0, 1]],
) {
  return {
    [bank]: {
      samples: {
        [sample]: {
          "0": regions.map(([start, end]) => ({
            type: "sprite" as const,
            src: source,
            start,
            end,
          })),
        },
      },
    },
  } satisfies Record<string, BankSchema>;
}

function defaultSamplerGraph(): DromeSchema {
  return {
    bpm: undefined,
    instruments: [defaultSamplerSchema()],
    banks: fileBank(),
    buses: {},
  };
}

export {
  chanceCondition,
  defaultEnvelope,
  defaultNotes,
  defaultSamplerGraph,
  defaultSamplerSchema,
  defaultSynthSchema,
  fileBank,
  randomNumberPattern,
  spriteBank,
  staticNumberBars,
  staticNumberPattern,
  timingBar,
  timingSchema,
};
