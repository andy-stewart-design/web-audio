// ---------------------------------------------------
// PRIMITIVES ----------------------------------------
// ---------------------------------------------------

type Waveform = "sine" | "square" | "sawtooth" | "triangle";

type EnvelopeMode = "bleed" | "clip";

type FilterType = "lp" | "hp" | "bp" | "notch" | "ap" | "pk" | "ls" | "hs";

// ---------------------------------------------------
// SEQUENCING ----------------------------------------
// ---------------------------------------------------

interface StaticSchemaValue {
  value: number;
  offset: number;
  duration: number;
  stepIndex: number;
}

interface StaticSchema {
  type: "static";
  polyphonic: boolean;
  cycle: StaticSchemaValue[][];
}

interface RandomSchema {
  type: "random";
  dataType: "float" | "integer" | "binary";
  segments: { seed: number; len?: number }[];
  quantValue: number | undefined;
  range: { min: number; max: number } | undefined;
  algorithm: "xor" | "mulberry";
  cycle: StaticSchema;
  valueMap?: number[];
}

type ParameterSchema = StaticSchema | RandomSchema;

interface FitSchema {
  type: "fit";
  bars: number;
}

// ---------------------------------------------------
// SAMPLING ------------------------------------------
// ---------------------------------------------------

interface BankDefinition {
  basePath: string;
  samples: Record<string, string[]>;
}

interface BankSchema {
  samples: Record<string, string[]>;
}

// ---------------------------------------------------
// AUTOMATIONS ---------------------------------------
// ---------------------------------------------------

interface EnvelopeSchema {
  type: "envelope";
  min: number;
  max: ParameterSchema;
  a: ParameterSchema;
  d: ParameterSchema;
  s: ParameterSchema;
  r: ParameterSchema;
  mode: EnvelopeMode;
}

interface LfoSchema {
  type: "lfo";
  id: string;
  outputA: ParameterSchema;
  outputB: ParameterSchema;
  speed: number[];
  waveform: Waveform[];
  phase: number;
  norm: boolean;
  invert: boolean;
}

// ---------------------------------------------------
// EFFECTS -------------------------------------------
// ---------------------------------------------------

interface FilterSchema {
  type: "filter";
  filterType: FilterType;
  frequency: ParameterSchema | EnvelopeSchema | LfoSchema;
  q: ParameterSchema | EnvelopeSchema | LfoSchema;
  detune: ParameterSchema | EnvelopeSchema | LfoSchema;
  gain: ParameterSchema | EnvelopeSchema | LfoSchema;
}

interface GainEffectSchema {
  type: "gain";
  gain: ParameterSchema | EnvelopeSchema | LfoSchema;
}

type EffectSchema = FilterSchema | GainEffectSchema;

// ---------------------------------------------------
// INSTRUMENTS ---------------------------------------
// ---------------------------------------------------

interface InstrumentSchema {
  gain: EnvelopeSchema;
  effects: EffectSchema[];
  detune: ParameterSchema | EnvelopeSchema | LfoSchema;
}

interface SynthesizerSchema extends InstrumentSchema {
  type: "synthesizer";
  waveform: Waveform;
  notes: ParameterSchema;
}

interface SamplerSchema extends InstrumentSchema {
  type: "sampler";
  bank: string;
  sample: string;
  variation: ParameterSchema;
  notes: ParameterSchema | FitSchema;
  loop: boolean;
}

// ---------------------------------------------------
// DROME ---------------------------------------------
// ---------------------------------------------------

interface DromeSchema {
  bpm?: number;
  instruments: (SynthesizerSchema | SamplerSchema)[];
  banks: Record<string, BankSchema>;
}

export type {
  BankDefinition,
  BankSchema,
  DromeSchema,
  EffectSchema,
  EnvelopeMode,
  EnvelopeSchema,
  FilterSchema,
  FilterType,
  FitSchema,
  GainEffectSchema,
  InstrumentSchema,
  LfoSchema,
  ParameterSchema,
  RandomSchema,
  SamplerSchema,
  StaticSchema,
  StaticSchemaValue,
  SynthesizerSchema,
  Waveform,
};
