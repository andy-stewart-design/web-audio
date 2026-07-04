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
  .notes([0, 4, 2, 0, 5, 4, 2, 0], [0, 0, 0, 0, 0, 0, 0, 0])
  .detune(d.lfo(0, [0, 400, 0, -400]).wave("saw").norm())
  .adsr(0.1, 1, 0.333, 0.5)
  .fx(
    d.lpf(d.env(200, 1600).adsr(0.25, 0.5, 0.25, 0.5)),
    d.lpf(d.lfo(800, 3200).wave("saw").speed(0.5).norm()),
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
  bank: "dmx",
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

// Multi-sampling

d.loadSamples({
  bank: "acoustic",
  baseUrl:
    "https://res.cloudinary.com/andystewartdesign/video/upload/samples/piano/",
  samples: {
    piano: {
      a2: ["045_A2v03.m4a", "045_A2v08.m4a"],
      a3: ["057_A3v03.m4a", "057_A3v08.m4a"],
      a4: ["069_A4v03.m4a", "069_A4v08.m4a"],
    },
  },
});

d.sample("piano")
  // .var([1,0])
  .var(d.rand().int().range(0, 2).steps(8))
  .bank("acoustic")
  .root("a2")
  .scale("min")
  .adsr(0, 0, 1, 1)
  .notes([0, 2, 4, 6, 7, 9, 11, 13])
  .push();

d.sample("piano", 0).bank("acoustic").notes(45).push(); // should play "https://www.files.com/file-01.wav"
d.sample("piano", 1).bank("acoustic").notes(45).push(); // should play "https://www.files.com/file-02.wav"
d.sample("piano", 0).bank("acoustic").notes(57).push(); // should play "https://www.files.com/file-03.wav"
d.sample("piano", 1).bank("acoustic").notes(57).push(); // should play "https://www.files.com/file-04.wav"

// Audio Sprite

d.loadSamples({
  bank: "acoustic",
  baseUrl:
    "https://res.cloudinary.com/andystewartdesign/video/upload/samples/harp/",
  samples: {
    harp: {
      d1: ["1d1.m4a"],
      a1: ["2a1.m4a"],
      d2: ["3d2.m4a"],
      a2: ["4a2.m4a"],
      d3: ["5d3.m4a"],
      a3: ["6a3.m4a"],
      d4: ["7d4.m4a"],
      a4: ["8a4.m4a"],
      d5: ["9d5.m4a"],
      a5: ["10a5.m4a"],
    },
  },
});

d.loadSamples({
  bank: "acoustic",
  src: "https://res.cloudinary.com/andystewartdesign/video/upload/samples/harp-sprite.m4a",
  samples: {
    harp: {
      a1: [[0.0, 0.354784043]],
      a2: [[0.354784043, 0.605698024]],
      a3: [[0.605698024, 0.847024012]],
      a4: [[0.847024012, 0.964624389]],
      a5: [[0.964624389, 1.0]],
    },
  },
});

d.sample("harp")
  .bank("acoustic")
  .root("a2")
  .scale("min")
  .adsr(0, 0, 1, 1)
  .notes([0, 2, 4, 6, 7, 9, 11, 13])
  .push();

d.loadSamples({
  bank: "effects",
  src: "https://res.cloudinary.com/andystewartdesign/video/upload/samples/farts.mp3",
  samples: {
    fart: [
      [0.0, 0.027893],
      [0.066667, 0.106245],
      [0.133333, 0.173909],
      [0.2, 0.244444],
      [0.266667, 0.27391],
      [0.311111, 0.355555],
      [0.377778, 0.394855],
      [0.422222, 0.434445],
      [0.466667, 0.473833],
      [0.511111, 0.530687],
      [0.555556, 0.604616],
      [0.644444, 0.684789],
      [0.711111, 0.766921],
      [0.8, 0.834582],
      [0.866667, 0.873277],
      [0.911111, 0.922376],
      [0.955556, 0.964297],
    ],
  },
});

d.sample("fart", 2).bank("effects").notes(0, null).gain(1.25).push();
d.sample("bd").hex(0xf).push();

// Multiple Variations
d.sample("bd").var([0, 1, 2, 3]).bank("tr909").hex(0xf).push();

// Plane noodling
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
  .hex(0xf)
  .gain(k ? 0.75 : 0)
  .push();

d.sample("hh")
  .hex(0xff)
  .gain(k ? [0.25, 0.175] : 0)
  .push();

// from `drome` project (this should eventually work)
d.bpm(127);

d.sample("breaks")
  .bank("loops")
  .fit(2)
  .chop(8, d.rand.int().rib([20, 13], 1).range(0, 7).steps(4).euclid(4, 8, 1))
  .gain(2)
  .fx(d.hpf(600))
  .push();

d.sample("bd:3").hex(0xf).push();

d.sample("oh")
  .hex(0x55)
  .gain(0.375)
  // .fx(d.pan(-1))
  .push();

d.sample("hh")
  .hex(0xff)
  .gain(d.rand.rib(0, 4).range(0.125, 0.5).steps(8))
  // .fx(d.pan(1))
  .push();

d.sample("rim").euclid(5, 8, 1).gain(0.5).push();

const ex1A = {
  banks: {
    acoustic: {
      piano: {
        a2: {
          root: 45,
          variations: ["file-01.wav", "file-02.wav"],
        },
        a3: {
          root: 57,
          variations: ["file-03.wav", "file-04.wav"],
        },
      },
    },
  },
};

const ex2A = {
  banks: {
    user: {
      bd: {
        0: {
          root: 0,
          variations: ["bd.wav"],
        },
      },
    },
  },
};

const ex1B = {
  banks: {
    acoustic: {
      piano: {
        45: ["file-01.wav", "file-02.wav"],
        57: ["file-03.wav", "file-04.wav"],
      },
    },
  },
};

const ex2B = {
  banks: {
    user: {
      bd: {
        0: ["bd.wav"],
      },
    },
  },
};
