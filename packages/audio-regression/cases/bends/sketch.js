d.loadSamples({
  bank: "local",
  samples: {
    bd: ["/samples/tr909-bd.wav"],
    hh: ["/samples/tr909-hh.wav"],
  },
});

const r = "a";
const o = 3;
const s = "min";
const b = 400;
const k = true;

d.synth("saw")
  .root(r + o)
  .scale(s)
  .notes([0, 4, 2, 0, 5, 4, 2, 0], [0, 0, 0, 0, 0, 0, 0, 0])
  .detune(d.lfo(0, [0, b, 0, -b]).wave("saw").norm())
  .gain(0.75)
  .adsr(0.05, 1, 0.333, 0.25)
  .fx(
    d.lpf(d.env(1600, 4000).adsr(0.25, 0.5, 0.5, 0.1)),
    d.lpf(d.lfo(1600, 4000).wave("saw").speed(0.5).norm()),
  )
  .push();

d.synth("sq")
  .root(r + (o - 2))
  .scale(s)
  .notes(0, 2, 3, -2)
  .gain(0.75)
  .stretch(4, 8)
  .adsr(0, 0.5, 0.75, 0.5)
  .fx(
    d.lpf(d.env(200, 800).adsr(0.25, 0.5, 0.25, 0.1)),
    d.lpf(k ? [400, 1200] : 1200),
  )
  .push();

d.sample("bd", 3)
  .bank("local")
  .hex(0xf)
  .gain(k ? 0.75 : 0)
  .push();

d.sample("hh")
  .bank("local")
  .hex(0xff)
  .gain(k ? [0.25, 0.175] : 0)
  .push();
