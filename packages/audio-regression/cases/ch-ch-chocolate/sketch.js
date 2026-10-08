d.bpm(94);

d.loadSamples({
  bank: "chocolate",
  samples: {
    tay: ["/samples/tay.mp3"],
    bd: ["/samples/bd-01.mp3", "/samples/bd-02.mp3"],
    cp: ["/samples/cp-01.mp3", "/samples/cp-02.mp3", "/samples/cp-03.mp3"],
    piano: ["/samples/piano.mp3"],
  },
});

const bank = "chocolate";

const scratchMask = d.rand().rib([0, 101], 2).bin().chance(0.6).steps(0, 16);
const scratchTime = d.rand().rib(202).range(0.05, 0.1).steps(0, 16);

d.sample("tay")
  .bank(bank)
  .xox(scratchMask)
  .start(0)
  .dur(scratchTime)
  .dir("alt")
  .detune(d.lfo(0, 700).speed(7.66))
  .gain(0.75)
  .push();

d.sample("tay")
  .bank(bank)
  .end(0.35, 0, 1, 0)
  .xox(1, 0, 1, 0)
  .detune(d.env(-1200, 0).a(0.325, 0, 0.0875, 0).d(0).s(1).r(0))
  .push();

const pianoPulses = [1, 0, 0, 1, 0, 0, 0];
const pianoRotate = [0, 0, 0, 2, 0, 0, 0];

d.sample("piano")
  .bank(bank)
  .euclid(pianoPulses, 4, pianoRotate)
  .gain(1.25)
  .detune(d.env(0, 100).adsr(0, 0.25, 0, 0))
  .clip(false)
  .push();

// prettier-ignore
const kickVariations = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
  [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0],
];

d.sample("bd")
  .bank(bank)
  .hex(0x8091, 0xb080, 0x91b0)
  .var(...kickVariations)
  .gain(1.5)
  .detune(d.rand().rib(303).range(-200, 200).steps(16))
  .push();

// prettier-ignore
const clapVariations = [
  [0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 2, 0],
  [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 0],
  [0, 0, 0, 0, 1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 1],
];

d.sample("cp")
  .bank(bank)
  .hex(0x180a, 0x4118, 0x0a41)
  .var(...clapVariations)
  .gain(1.5)
  .detune(d.rand().rib(304).range(-200, 200).steps(16))
  .push();
