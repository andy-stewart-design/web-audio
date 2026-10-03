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

type WaveformAlias = keyof typeof waveformAliasMap;

function resolveWaveform(alias: WaveformAlias): Waveform {
  return waveformAliasMap[alias];
}

export { waveformAliasMap, resolveWaveform };
export type { WaveformAlias };
