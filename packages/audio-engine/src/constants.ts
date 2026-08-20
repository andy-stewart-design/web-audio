import type { FilterType } from "@web-audio/schema";

const MIN_RAMP = 0.0025;
const SYNTH_BASE_GAIN = 0.325;
const SAMPLE_BASE_GAIN = 0.875;
const FILTER_SETTLING_TIME = 0.1;
const RETIREMENT_FADE_TIME = 0.01;

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

export {
  FILTER_SETTLING_TIME,
  FILTER_TYPE_MAP,
  MIN_RAMP,
  RETIREMENT_FADE_TIME,
  SAMPLE_BASE_GAIN,
  SYNTH_BASE_GAIN,
};
