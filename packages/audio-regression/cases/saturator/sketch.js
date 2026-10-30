d.bpm(128);
d.loadSamples({
  bank: "local",
  samples: { tone: ["/samples/tone.wav"] },
});
d.bus("drums").fx(d.saturator(2.2).postgain([0.22, 0.32]));
d.synth("sawtooth")
  .notes([48, 55])
  .xox("x..x")
  .gain(0.3)
  .adsr(0.01, 0.05, 0.8, 0.12)
  .fx(d.saturator(1.25).postgain(0.7))
  .push();
d.sample("tone")
  .bank("local")
  .xox(".x..")
  .gain(0.55)
  .adsr(0.02, 0, 1, 0.08)
  .fx(d.saturator(3).postgain(0.2))
  .push();
d.synth("square").notes([36, 43]).xox("x...").gain(0.28).route("drums").push();
