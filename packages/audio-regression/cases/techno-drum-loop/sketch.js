d.bpm(140);

d.loadSamples({
  bank: "local",
  samples: {
    bd: ["/samples/tr909-kick.wav"],
    hh: ["/samples/tr909-hi-hat.wav"],
    oh: ["/samples/tr909-open-hat.wav"],
    cp: ["/samples/tr808-clap.wav"],
    sd: ["/samples/tr909-snare.wav"],
  },
});

d.sample("bd", 3).bank("local").hex(0xf).push();
d.sample("hh").bank("local").hex(0xffff).gain([0.5, 0.375]).push();
d.sample("sd").bank("local").hex(0x5).push();
d.sample("cp", 1).bank("local").hex(0x1).push();
d.sample("oh", 3).bank("local").hex(0x55).gain(0.375).clip(false).push();
