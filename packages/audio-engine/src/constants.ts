import type { FilterType } from "@web-audio/schema";

const MIN_RAMP = 0.005;
const SYNTH_BASE_GAIN = 0.325;
const SAMPLE_BASE_GAIN = 0.875;

const FILTER_TYPE_MAP: Record<FilterType, BiquadFilterType> = {
  lp: "lowpass",
  hp: "highpass",
  bp: "bandpass",
  notch: "notch",
  ap: "allpass",
  pk: "peaking",
  ls: "lowshelf",
  hs: "highshelf",
};

export { SYNTH_BASE_GAIN, SAMPLE_BASE_GAIN, FILTER_TYPE_MAP, MIN_RAMP };
