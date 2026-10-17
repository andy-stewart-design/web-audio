d.bpm(137);
d.synth("unison")
  .notes([60, 64, 67, 72])
  .xox("x.o.")
  .voices([1, 2, 7, 8])
  .spread([0, 12, 24, 36])
  .width([0, 0.4, 0.8, 1])
  .gain(0.35)
  .adsr(0.01, 0.1, 0.8, 0.1)
  .fx(d.lpf(3_000).q(8))
  .push();
