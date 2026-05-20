// ------------------------------------------------
// LFO Tests
// ------------------------------------------------

d.synth("saw")
  .root("c4")
  .scale("min")
  .notes([0, 2, 4, 6], [8, 6, 4, 2])
  .fast(2)
  .gain(d.env().adsr(0, 1, 0.333, 1))
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
  .gain(d.env().adsr(0, 1, 0.333, 1))
  .fx(
    d.lpf(d.env(200, 1600).adsr(0.25, 0.5, 0.25, 0.5)),
    d.lpf(d.lfo(200, 1600).wave("sq").off(0.5).speed(2).norm()),
  )
  .push();

d.synth("saw")
  .root("a3")
  .scale("min")
  .notes([0, 4])
  .fx(d.lpf(d.lfo(100, 1600).wave("sq").inv().norm()))
  .push();

d.synth("saw")
  .root("a3")
  .scale("min")
  .notes([0, 2, 4, 6])
  .detune(d.lfo(0, 200).wave("sq").inv().speed(8).norm())
  .fx(d.lpf(1200))
  .push();

// ------------------------------------------------
// Sample Tests
// ------------------------------------------------

d.sample("bd:3").bank("tr909").hex(0xf).push();
d.sample("hh").bank("tr909").hex(0xff).gain([0.5, 0.375]).push();
d.sample("sd").bank("tr909").hex(0x5).push();
d.sample("cp:2").bank("tr909").hex(0x1).gain(1.5).push();
d.sample("oh").bank("tr909").hex(0x55).gain(0.375).push();
