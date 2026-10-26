import type { SynthEngine, Waveform } from "@web-audio/schema";

const waveformAliasMap = {
  sin: "sine",
  sine: "sine",
  tri: "triangle",
  triangle: "triangle",
  sq: "square",
  square: "square",
  saw: "sawtooth",
  sawtooth: "sawtooth",
} satisfies Record<string, Waveform>;

const unisonWaveformAliasMap = {
  saw: "sawtooth",
  sawtooth: "sawtooth",
} satisfies Record<string, "sawtooth">;

type WaveformAlias = keyof typeof waveformAliasMap;
type UnisonWaveformAlias = keyof typeof unisonWaveformAliasMap;

const synthEngineAliasMap = {
  unison: "unison",
  uni: "unison",
} satisfies Record<string, SynthEngine>;

type SynthEngineAlias = keyof typeof synthEngineAliasMap;

const synthSelectorAliasMap = {
  ...waveformAliasMap,
  ...synthEngineAliasMap,
};

type SynthSelector = keyof typeof synthSelectorAliasMap;

function resolveWaveform(alias: WaveformAlias): Waveform {
  return waveformAliasMap[alias];
}

function resolveUnisonWaveform(alias: UnisonWaveformAlias) {
  if (!Object.hasOwn(unisonWaveformAliasMap, alias)) {
    throw new TypeError(`[Drome] Unsupported unison waveform "${alias}".`);
  }
  return unisonWaveformAliasMap[alias];
}

export {
  resolveUnisonWaveform,
  resolveWaveform,
  synthEngineAliasMap,
  synthSelectorAliasMap,
  unisonWaveformAliasMap,
  waveformAliasMap,
};
export type {
  SynthEngineAlias,
  SynthSelector,
  UnisonWaveformAlias,
  WaveformAlias,
};
