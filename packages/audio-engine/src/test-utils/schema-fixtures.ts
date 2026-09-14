import type {
  BankSchema,
  ChanceCondition,
  DromeSchema,
  EnvelopeSchema,
  NotePattern,
  RandomNumberPattern,
  SamplerEventPattern,
  SamplerSchema,
  SynthEventPattern,
  SynthesizerSchema,
  StaticPattern,
  TimingPattern,
  TimingStep,
} from "@web-audio/schema";

function staticNumberPattern(values: number[] = [0]): StaticPattern<number> {
  return { type: "static", cycle: [values] };
}

function staticNumberBars(...values: number[]): StaticPattern<number> {
  return {
    type: "static",
    cycle: values.map((value) => [value]),
  };
}

function randomNumberPattern(
  overrides: Partial<Omit<RandomNumberPattern, "type">> = {},
) {
  return {
    type: "random-number",
    valuesPerBar: [1],
    algorithm: "xor",
    dataType: "float",
    segments: [{ seed: 0 }],
    order: "forward",
    ...overrides,
  } satisfies RandomNumberPattern;
}

function timingBar(steps: TimingStep[] = [{ offset: 0, duration: 1 }]) {
  return steps;
}

function timingSchema(bars: TimingStep[][] = [timingBar()]) {
  return { cycle: bars } satisfies TimingPattern;
}

function chanceCondition(
  probability = 1,
  overrides: Partial<Omit<ChanceCondition, "type" | "probability">> = {},
) {
  return {
    type: "chance",
    probability,
    segments: [{ seed: 0 }],
    algorithm: "xor",
    order: "forward",
    ...overrides,
  } satisfies ChanceCondition;
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

function defaultNotes(): NotePattern {
  return { type: "static", cycle: [[[60]]] };
}

function defaultSynthEventPattern(
  overrides: Partial<SynthEventPattern> = {},
): SynthEventPattern {
  return {
    timing: timingSchema(),
    notes: defaultNotes(),
    ...overrides,
  };
}

type SynthSchemaOverrides = Partial<
  Pick<
    SynthesizerSchema,
    | "waveform"
    | "eventPattern"
    | "notesOut"
    | "detune"
    | "gain"
    | "effects"
    | "muted"
    | "route"
    | "sends"
  >
>;

function defaultSynthSchema(overrides: SynthSchemaOverrides = {}) {
  return {
    type: "synthesizer",
    waveform: "sine",
    eventPattern: defaultSynthEventPattern(),
    detune: staticNumberPattern([0]),
    gain: defaultEnvelope(),
    effects: [],
    muted: false,
    route: "main",
    sends: {},
    ...overrides,
  } satisfies SynthesizerSchema;
}

function defaultSamplerEventPattern(
  overrides: Partial<SamplerEventPattern> = {},
): SamplerEventPattern {
  return {
    timing: timingSchema(),
    sampleNames: { type: "static", cycle: [[["bd"]]] },
    ...overrides,
  };
}

type SamplerSchemaOverrides = Partial<
  Pick<
    SamplerSchema,
    | "bank"
    | "eventPattern"
    | "fit"
    | "region"
    | "detune"
    | "gain"
    | "effects"
    | "muted"
    | "route"
    | "sends"
    | "loop"
    | "clipMode"
    | "direction"
  >
>;

function defaultSamplerSchema(overrides: SamplerSchemaOverrides = {}) {
  return {
    type: "sampler",
    bank: "kit",
    eventPattern: defaultSamplerEventPattern(),
    fit: null,
    region: null,
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
  defaultSamplerEventPattern,
  defaultSamplerGraph,
  defaultSamplerSchema,
  defaultSynthEventPattern,
  defaultSynthSchema,
  fileBank,
  randomNumberPattern,
  spriteBank,
  staticNumberBars,
  staticNumberPattern,
  timingBar,
  timingSchema,
};
