import type {
  CLIP_MODES,
  ENVELOPE_MODES,
  FILTER_TYPES,
  MIDI_RANGE_CURVES,
  PATTERN_ORDERS,
  RANDOM_ALGORITHMS,
  RANDOM_DATA_TYPES,
  SAMPLE_DIRECTIONS,
  WAVEFORMS,
} from "./constants";

// ---------------------------------------------------
// PRIMITIVES ----------------------------------------
// ---------------------------------------------------

type Waveform = (typeof WAVEFORMS)[number];

type EnvelopeMode = (typeof ENVELOPE_MODES)[number];

type ClipMode = (typeof CLIP_MODES)[number];

type SampleDirection = (typeof SAMPLE_DIRECTIONS)[number];

type FilterType = (typeof FILTER_TYPES)[number];

type RandomDataType = (typeof RANDOM_DATA_TYPES)[number];

type RandomAlgorithm = (typeof RANDOM_ALGORITHMS)[number];

type PatternOrder = (typeof PATTERN_ORDERS)[number];

type MidiRangeCurve = (typeof MIDI_RANGE_CURVES)[number];

// ---------------------------------------------------
// SEQUENCING ----------------------------------------
// ---------------------------------------------------

interface StaticValuePattern<T> {
  type: "static";
  cycle: T[][];
}

interface RandomNumberPattern {
  type: "random-number";
  valuesPerBar: number[];
  dataType: RandomDataType;
  segments: { seed: number; len?: number }[];
  range?: { min: number; max: number };
  quantValue?: number;
  algorithm: RandomAlgorithm;
  valueMap?: number[];
  order: PatternOrder;
}

type NumberPattern = StaticValuePattern<number> | RandomNumberPattern;

type StaticNotePattern = StaticValuePattern<number[] | null>;
type NotePattern = StaticNotePattern | RandomNumberPattern;

type SampleNamePattern = StaticValuePattern<string[] | null>;
type StaticVariationIndexPattern = StaticValuePattern<number[] | null>;
type VariationIndexPattern = StaticVariationIndexPattern | RandomNumberPattern;

interface TimingStep {
  offset: number;
  duration: number;
}

interface ChanceCondition {
  type: "chance";
  probability: number;
  segments: { seed: number; len?: number }[];
  algorithm: RandomAlgorithm;
  order: PatternOrder;
}

interface TimingSchema {
  cycle: TimingStep[][];
  condition?: ChanceCondition;
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
    curve: MidiRangeCurve;
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
  start: NumberPattern;
  end: NumberPattern;
  duration?: never;
}

interface StaticDurationRegionSchema {
  type: "static";
  start: NumberPattern;
  duration: NumberPattern;
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
  sequence: NumberPattern;
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
  max: NumberPattern;
  a: NumberPattern;
  d: NumberPattern;
  s: NumberPattern;
  r: NumberPattern;
  mode: EnvelopeMode;
}

interface LfoSchema {
  type: "lfo";
  id: string;
  outputA: NumberPattern;
  outputB: NumberPattern;
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
  | NumberPattern
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
  transition: number;
  effects: EffectSchema[];
}

// ---------------------------------------------------
// INSTRUMENTS ---------------------------------------
// ---------------------------------------------------

interface SynthEventSchema {
  timing: TimingSchema;
  notes: NotePattern;
}

interface SamplerEventSchema {
  timing: TimingSchema;
  notes?: NotePattern;
  sampleNames: SampleNamePattern;
  variationIndices?: VariationIndexPattern;
}

interface InstrumentSchema<TEvents> {
  events: TEvents;
  gain: EnvelopeSchema;
  effects: EffectSchema[];
  detune: AudioParamSchema;
  muted: boolean;
  route: string;
  sends: Record<string, number>;
}

interface SynthesizerSchema extends InstrumentSchema<SynthEventSchema> {
  type: "synthesizer";
  waveform: Waveform;
  notesOut?: MidiOutSchema;
}

interface SamplerSchema extends InstrumentSchema<SamplerEventSchema> {
  type: "sampler";
  bank: string;
  fit: FitSchema | null;
  region: RegionSchema | null;
  loop: boolean;
  clipMode: ClipMode;
  direction: SampleDirection;
}

// ---------------------------------------------------
// DROME ---------------------------------------------
// ---------------------------------------------------

interface DromeSchema {
  bpm: number | undefined;
  instruments: (SynthesizerSchema | SamplerSchema)[];
  banks: Record<string, BankSchema>;
  buses: Record<string, BusSchema>;
}

export { validateDromeGraph } from "./validate-graph";

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
  LfoSchema,
  MidiCcSchema,
  MidiOutSchema,
  ChanceCondition,
  InstrumentSchema,
  SamplerEventSchema,
  SynthEventSchema,
  NotePattern,
  NormalizedSampleSchema,
  NumberPattern,
  RandomNumberPattern,
  RegionSchema,
  SampleDirection,
  SamplerSchema,
  SampleVariationSchema,
  SpriteSampleVariationSchema,
  StaticDurationRegionSchema,
  StaticEndRegionSchema,
  StaticNotePattern,
  StaticRegionSchema,
  StaticValuePattern,
  StaticVariationIndexPattern,
  SynthesizerSchema,
  SampleNamePattern,
  TimingSchema,
  TimingStep,
  VariationIndexPattern,
  Waveform,
};
