import type { ScaleAlias } from "../types";

const baseScaleMap = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
};

export const scaleAliasMap = {
  major: baseScaleMap.major,
  maj: baseScaleMap.major,
  minor: baseScaleMap.minor,
  min: baseScaleMap.minor,
  ionian: baseScaleMap.major,
  ion: baseScaleMap.major,
  aeolian: baseScaleMap.minor,
  aeo: baseScaleMap.minor,
  dorian: baseScaleMap.dorian,
  dor: baseScaleMap.dorian,
  phrygian: baseScaleMap.phrygian,
  phr: baseScaleMap.phrygian,
  lydian: baseScaleMap.lydian,
  lyd: baseScaleMap.lydian,
  mixolydian: baseScaleMap.mixolydian,
  mix: baseScaleMap.mixolydian,
  locrian: baseScaleMap.locrian,
  loc: baseScaleMap.locrian,
};

function getScale(name: ScaleAlias) {
  return scaleAliasMap[name];
}

export { getScale };
