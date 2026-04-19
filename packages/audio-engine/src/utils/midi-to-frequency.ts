function midiToFrequency(midiNote: number) {
  if (midiNote > 127 || midiNote <= 0) return 0;
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

export { midiToFrequency };
