const WAVEFORMS = ["sine", "square", "sawtooth", "triangle"] as const;

const ENVELOPE_MODES = ["bleed", "bounded"] as const;

const CLIP_MODES = ["clipped", "one-shot"] as const;

const SAMPLE_DIRECTIONS = ["forward", "reverse", "alternate"] as const;

const FILTER_TYPES = [
  "lp",
  "hp",
  "bp",
  "notch",
  "ap",
  "pk",
  "ls",
  "hs",
] as const;

const RANDOM_DATA_TYPES = ["float", "integer", "binary"] as const;

const RANDOM_ALGORITHMS = ["xor", "mulberry"] as const;

const PATTERN_ORDERS = ["forward", "reverse"] as const;

const MIDI_RANGE_CURVES = ["linear", "exponential"] as const;

function isOneOf<const T extends readonly unknown[]>(
  values: T,
  value: unknown,
): value is T[number] {
  return values.some((candidate) => candidate === value);
}

export {
  CLIP_MODES,
  ENVELOPE_MODES,
  FILTER_TYPES,
  MIDI_RANGE_CURVES,
  PATTERN_ORDERS,
  RANDOM_ALGORITHMS,
  RANDOM_DATA_TYPES,
  SAMPLE_DIRECTIONS,
  WAVEFORMS,
  isOneOf,
};
