import type { Waveform } from "@web-audio/schema";

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
type SynthSelector = WaveformAlias | "unison" | "uni";

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
  unisonWaveformAliasMap,
  waveformAliasMap,
};
export type { SynthSelector, UnisonWaveformAlias, WaveformAlias };
