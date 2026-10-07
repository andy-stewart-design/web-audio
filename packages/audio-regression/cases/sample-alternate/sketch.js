d.loadSamples({
  bank: "local",
  samples: { hit: ["/samples/asymmetric.wav"] },
});
d.sample("hit")
  .bank("local")
  .sequence(3, [0, 1, 2])
  .direction("alternate")
  .clip(false)
  .push();
