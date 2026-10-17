d.loadSamples({
  bank: "local",
  samples: { tone: ["/samples/tone.wav"] },
});
d.sample("tone")
  .bank("local")
  .xox("x...x...")
  .gain(0.8)
  .adsr(0.1, 0, 1, 0.1)
  .fx(d.lpf(1200).q(12))
  .push();
