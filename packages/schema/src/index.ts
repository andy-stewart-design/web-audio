type Waveform = "sine" | "square" | "sawtooth" | "triangle";

type EnvelopeMode = "bleed" | "clip";

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

type FilterType = "lp" | "hp" | "bp" | "notch" | "ap" | "pk" | "ls" | "hs";

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

interface SynthesizerSchema {
  type: "synthesizer";
  waveform: Waveform;
  notes: ParameterSchema;
  detune: ParameterSchema | EnvelopeSchema | LfoSchema;
  gain: EnvelopeSchema;
  effects: EffectSchema[];
}

interface DromeSchema {
  bpm?: number;
  instruments: SynthesizerSchema[];
}

export type {
  DromeSchema,
  EffectSchema,
  EnvelopeMode,
  EnvelopeSchema,
  FilterSchema,
  FilterType,
  GainEffectSchema,
  LfoSchema,
  ParameterSchema,
  RandomSchema,
  StaticSchema,
  StaticSchemaValue,
  SynthesizerSchema,
  Waveform,
};
