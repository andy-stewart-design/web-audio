// ---------------------------------------------------
// PRIMITIVES ----------------------------------------
// ---------------------------------------------------

type Waveform = "sine" | "square" | "sawtooth" | "triangle";

type EnvelopeMode = "bleed" | "bounded";

type ClipMode = "clipped" | "one-shot";

type SampleDirection = "forward" | "reverse" | "alternate";

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
  chance?: number;
  range: { min: number; max: number } | undefined;
  algorithm: "xor" | "mulberry";
  grid: StaticSchema;
  valueMap?: number[];
}

type ParameterSchema = StaticSchema | RandomSchema;

interface NotesSchema {
  source: ParameterSchema;
  mask?: ParameterSchema;
}

// ---------------------------------------------------
// MIDI ----------------------------------------------
// ---------------------------------------------------

interface MidiOutSchema {
  type: "midi-out";
  device?: string;
  channel: number;
}

interface MidiCcSchema {
  type: "midi-cc";
  cc: number;
  device?: string;
  channel?: number;
  range: {
    min: number;
    max: number;
    curve: "linear" | "exponential";
  };
  default: number;
}

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

interface FileSampleVariationSchema {
  type: "file";
  src: string;
}

interface SpriteSampleVariationSchema {
  type: "sprite";
  src: string;
  start: number;
  end: number;
}

type SampleVariationSchema =
  | FileSampleVariationSchema
  | SpriteSampleVariationSchema;

type NormalizedSampleSchema = Record<string, SampleVariationSchema[]>;

interface StaticEndRegionSchema {
  type: "static";
  start: ParameterSchema;
  end: ParameterSchema;
  duration?: never;
}

interface StaticDurationRegionSchema {
  type: "static";
  start: ParameterSchema;
  duration: ParameterSchema;
  end?: never;
}

type StaticRegionSchema = StaticEndRegionSchema | StaticDurationRegionSchema;

interface ChopSliceSchema {
  start: number;
  end: number;
}

interface ChopRegionSchema {
  type: "chop";
  slices: ChopSliceSchema[];
  sequence: ParameterSchema;
}

type RegionSchema = StaticRegionSchema | ChopRegionSchema;

interface BankSchema {
  samples: Record<string, NormalizedSampleSchema>;
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

type AudioParamSchema =
  | ParameterSchema
  | EnvelopeSchema
  | LfoSchema
  | MidiCcSchema;

interface FilterSchema {
  type: "filter";
  filterType: FilterType;
  frequency: AudioParamSchema;
  q: AudioParamSchema;
  detune: AudioParamSchema;
  gain: AudioParamSchema;
}

interface GainEffectSchema {
  type: "gain";
  gain: AudioParamSchema;
}

type EffectSchema = FilterSchema | GainEffectSchema;

// ---------------------------------------------------
// SIGNAL GRAPH --------------------------------------
// ---------------------------------------------------

interface BusSchema {
  gain: number;
  effects: EffectSchema[];
}

// ---------------------------------------------------
// INSTRUMENTS ---------------------------------------
// ---------------------------------------------------

interface InstrumentSchema {
  gain: EnvelopeSchema;
  effects: EffectSchema[];
  detune: AudioParamSchema;
  muted: boolean;
  route?: string;
}

interface SynthesizerSchema extends InstrumentSchema {
  type: "synthesizer";
  waveform: Waveform;
  notes: NotesSchema;
  notesOut?: MidiOutSchema;
}

interface SamplerSchema extends InstrumentSchema {
  type: "sampler";
  bank: string;
  sample: string;
  variation: ParameterSchema;
  notes: NotesSchema;
  fit: FitSchema | null;
  region: RegionSchema | null;
  sourceKeys: number[];
  loop: boolean;
  clipMode: ClipMode;
  direction: SampleDirection;
}

// ---------------------------------------------------
// DROME ---------------------------------------------
// ---------------------------------------------------

interface DromeSchema {
  bpm?: number;
  instruments: (SynthesizerSchema | SamplerSchema)[];
  banks: Record<string, BankSchema>;
  buses?: Record<string, BusSchema>;
}

export type {
  AudioParamSchema,
  BankDefinition,
  BankSchema,
  BusSchema,
  ChopRegionSchema,
  ChopSliceSchema,
  ClipMode,
  DromeSchema,
  EffectSchema,
  EnvelopeMode,
  EnvelopeSchema,
  FileSampleVariationSchema,
  FilterSchema,
  FilterType,
  FitSchema,
  GainEffectSchema,
  InstrumentSchema,
  LfoSchema,
  MidiCcSchema,
  MidiOutSchema,
  NotesSchema,
  NormalizedSampleSchema,
  ParameterSchema,
  RandomSchema,
  RegionSchema,
  SampleDirection,
  SamplerSchema,
  SampleVariationSchema,
  SpriteSampleVariationSchema,
  StaticDurationRegionSchema,
  StaticEndRegionSchema,
  StaticRegionSchema,
  StaticSchema,
  StaticSchemaValue,
  SynthesizerSchema,
  Waveform,
};
