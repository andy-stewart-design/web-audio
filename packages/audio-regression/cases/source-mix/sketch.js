d.bpm(132);

const passages = [
  ["sine", -1, 48, "x..."],
  ["triangle", -2, 52, ".x.."],
  ["square", -1, 55, "..x."],
  ["sawtooth", -2, 59, "...x"],
];

for (const [waveform, octave, note, pattern] of passages) {
  d.synth("saw", 0.72)
    .sub(waveform, octave, 0.64)
    .notes(note)
    .xox(pattern)
    .gain(0.35)
    .adsr(0.01, 0.04, 0.8, 0.12)
    .fx(d.gain(0.55))
    .push();
}

d.synth("unison", 0.64)
  .voices(5)
  .spread(20)
  .width(0.85)
  .sub("sine", -1, 0.72)
  .notes([55, 62])
  .xox("xx")
  .gain(0.32)
  .adsr(0.01, 0.05, 0.75, 0.15)
  .fx(d.gain(0.5))
  .push();
