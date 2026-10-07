d.loadSamples({
  bank: "local",
  samples: { tone: ["/samples/tone.wav"] },
});
d.sample("tone").bank("local").clip(false).push();
