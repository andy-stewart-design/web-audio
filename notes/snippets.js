// ------------------------------------------------
// LFO Tests
// ------------------------------------------------

d.synth("saw")
  .root("c4")
  .scale("min")
  .notes([0, 2, 4, 6], [8, 6, 4, 2])
  .fast(2)
  .adsr(0, 1, 0.333, 1)
  .fx(
    d.lpf(d.env(200, 1600).adsr(0.25, 0.5, 0.25, 0.5)),
    d.lpf(d.lfo(200, 2400).wave("saw").speed(0.5).norm()),
  )
  .push();

d.synth("sq")
  .root("c4")
  .scale("min")
  .notes([0, 2, 4, 6], [8, 6, 4, 2])
  .fast(2)
  .adsr(0, 1, 0.333, 1)
  .fx(
    d.lpf(d.env(200, 1600).adsr(0.25, 0.5, 0.25, 0.5)),
    d.lpf(d.lfo(200, 1600).wave("sq").off(0.5).speed(2).norm()),
  )
  .push();

d.synth("saw")
  .root("a3")
  .scale("min")
  .notes([0, 4])
  .detune(d.lfo(0, [0, 1200]).wave("sq").inv().norm())
  .fx(d.lpf(d.lfo(100, 1600).wave("sq").inv().norm()))
  .push();

d.synth("saw")
  .root("a3")
  .scale("min")
  .notes([0, 2, 4, 6])
  .detune(d.lfo(0, 200).wave("sq").inv().speed(8).norm())
  .fx(d.lpf(1200))
  .push();

d.synth("saw")
  .root("c4")
  .scale("min")
  .notes([0, 2, 4, 0], [0, 0, 0, 0])
  .detune(d.lfo(0, [0, 400, 0, -400]).wave("saw").norm())
  .adsr(0, 1, 0.333, 1)
  .fx(
    d.lpf(d.env(200, 1600).adsr(0.25, 0.5, 0.25, 0.5)),
    d.lpf(d.lfo(200, 2400).wave("saw").speed(0.5).norm()),
  )
  .push();

// ------------------------------------------------
// Sample Tests
// ------------------------------------------------

d.sample("bd", 3).bank("tr909").hex(0xf).push();
d.sample("hh").bank("tr909").hex(0xffff).gain([0.5, 0.375]).push();
d.sample("sd").bank("tr909").hex(0x5).push();
d.sample("cp", 1).bank("tr808").hex(0x1).push();
d.sample("oh", 3).bank("tr909").hex(0x55).gain(0.375).clip(false).push();

// Fit sample to bar
d.sample("breaks").bank("loops").fit(2).push();

// Sample loading, named
d.loadSamples({
  name: "dmx",
  samples: {
    bd: [
      "https://raw.githubusercontent.com/ritchse/tidal-drum-machines/main/machines/OberheimDMX/oberheimdmx-bd/Bassdrum-01.wav",
    ],
  },
});

d.sample("bd").bank("dmx").hex(0xf).push();

// Sample loading, unnamed
d.loadSamples({
  bd: [
    "https://raw.githubusercontent.com/ritchse/tidal-drum-machines/main/machines/OberheimDMX/oberheimdmx-bd/Bassdrum-01.wav",
  ],
});

d.sample("bd").bank("user").hex(0xf).push();

// Multiple Variations
d.sample("bd").var([0, 1, 2, 3]).bank("tr909").hex(0xf).push();

// TO DEBUG

d.synth("saw")
  .root("c4")
  .scale("min")
  .notes([0, 0, 0, 0])
  .detune(d.env(0, 400).adsr(1, 0, 0, 0)) // This works, frequency decreases over duration of note
  .adsr(0, 1, 0.333, 1)
  .fx(d.lpf(800))
  .push();

d.synth("saw")
  .root("c4")
  .scale("min")
  .notes([0, 0, 0, 0])
  .detune(d.env(0, 400).adsr(0, 1, 0, 0)) // This doesn't, frequency sustains at envelope max
  .adsr(0, 1, 0.333, 1)
  .fx(d.lpf(800))
  .push();

d.synth("saw")
  .root("c4")
  .scale("min")
  .notes([0, 0, 0, 0])
  .detune(d.env(0, 400).adsr(0.01, 1, 0, 0)) // This does, frequency increases over duration of note
  .adsr(0, 1, 0.333, 1)
  .fx(d.lpf(800))
  .push();
