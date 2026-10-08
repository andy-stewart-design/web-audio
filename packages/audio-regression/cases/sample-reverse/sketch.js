d.loadSamples({
  bank: "local",
  samples: { hit: ["/samples/asymmetric.wav"] },
});
d.sample("hit").bank("local").direction("reverse").clip(false).push();
