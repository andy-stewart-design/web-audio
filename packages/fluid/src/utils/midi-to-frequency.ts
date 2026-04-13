function midiToFrequency(midiNote: number) {
  // A4 (MIDI note 69) = 440 Hz
  // Each semitone is 2^(1/12) times the previous frequency
  if (midiNote > 127) {
    const err = `[midiToFrequency] note provided is out of range: ${midiNote}`;
    console.warn(err);
    return 0;
  }
  if (midiNote <= 0) return 0;
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

export { midiToFrequency };
