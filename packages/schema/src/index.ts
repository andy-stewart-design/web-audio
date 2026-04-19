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

interface SynthesizerSchema {
  type: "synthesizer";
  waveform: Waveform;
  notes: ParameterSchema;
  detune: ParameterSchema;
}

interface DromeSchema {
  instruments: SynthesizerSchema[];
}

export type {
  DromeSchema,
  ParameterSchema,
  RandomSchema,
  StaticSchema,
  StaticSchemaValue,
  SynthesizerSchema,
  Waveform,
};
