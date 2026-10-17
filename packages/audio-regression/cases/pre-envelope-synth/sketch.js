d.synth("saw")
  .notes([60, 64, 67, 72])
  .gain(0.75)
  .adsr(0.15, 0, 1, 0.2)
  .fx(d.lpf(900).q(12))
  .push();
