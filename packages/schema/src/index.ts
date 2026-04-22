type Waveform = "sine" | "square" | "sawtooth" | "triangle";

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
  mode: "bleed" | "clip";
}

type FilterType = "lp" | "hp" | "bp" | "notch" | "ap" | "pk" | "ls" | "hs";

interface FilterSchema {
  type: "filter";
  filterType: FilterType;
  frequency: ParameterSchema | EnvelopeSchema;
  q: ParameterSchema | EnvelopeSchema;
  detune: ParameterSchema | EnvelopeSchema;
  gain: ParameterSchema | EnvelopeSchema;
}

type EffectSchema = FilterSchema;

interface SynthesizerSchema {
  type: "synthesizer";
  waveform: Waveform;
  notes: ParameterSchema;
  detune: ParameterSchema | EnvelopeSchema;
  gain: EnvelopeSchema;
  effects: EffectSchema[];
}

interface DromeSchema {
  instruments: SynthesizerSchema[];
}

export type {
  DromeSchema,
  EffectSchema,
  EnvelopeSchema,
  FilterSchema,
  FilterType,
  ParameterSchema,
  RandomSchema,
  StaticSchema,
  StaticSchemaValue,
  SynthesizerSchema,
  Waveform,
};
