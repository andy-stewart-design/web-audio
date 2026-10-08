d.synth("sine")
  .notes(d.rand().int().range(57, 81).steps(8).ribbon(11))
  .xox(d.rand().bin().steps(8).chance(0.6).ribbon(42))
  .gain(0.4)
  .adsr(0.005, 0, 1, 0.02)
  .push();
