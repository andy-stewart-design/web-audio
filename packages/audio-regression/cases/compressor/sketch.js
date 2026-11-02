d.bpm(120);
d.bus("drums")
  .gain(0.7)
  .fx(d.compressor(-18, 4).knee(12).attack(0.003).release(0.2));
d.synth("sawtooth")
  .notes([36, 43, 48])
  .xox("x..x")
  .gain(0.2)
  .adsr(0.01, 0.05, 0.8, 0.12)
  .route("drums")
  .push();
d.synth("square")
  .notes([48, 55, 60])
  .xox(".x.x")
  .gain(0.16)
  .adsr(0.005, 0.03, 0.75, 0.08)
  .route("drums")
  .push();
