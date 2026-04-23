import type { FilterType } from "@web-audio/schema";

const MIN_RAMP = 0.005;
const BASE_GAIN = 0.25;

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

export { BASE_GAIN, FILTER_TYPE_MAP, MIN_RAMP };
