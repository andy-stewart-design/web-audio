// Static variation indices: fractional values round, then wrap.
// bd has four variations: -1 → 3, 4 → 0, 5.6 → 2.
d.sample("bd").xox("x...").var(-1, 4, 5.6, 1).push();

//  —————————————————————————————————————————————————————————————————————————————————

// Layered sampler voices: all entries in each nested group trigger together.
// Each voice uses its own source-key-specific variation count.
d.sample("bd")
  .notes(10, 60)
  .var([0, 1], [2, 3], [-1, 4], [1, 2])
  .stretch(1, 2)
  .push();

// OR

d.sample("bd")
  .xox("x - x x")
  .notes(10, 60)
  .var([0, 1], [2, 3], [-1, 4], [1, 2])
  .push();

//  —————————————————————————————————————————————————————————————————————————————————

// A random variation value is chosen once per hit and broadcast to every
// voice in the chord/layer.
d.sample("sd").notes([10, 20]).var(d.rand().range(-1, 4).steps(8)).push();

//  —————————————————————————————————————————————————————————————————————————————————

// One timing chance decision gates the complete layered event—both samples
// fire together or neither does.
d.sample("cp")
  .xox(d.rand().bin().chance(0.5).rib(42).steps(8))
  .notes([10, 20])
  .var([[0, 1]])
  .push();

//  —————————————————————————————————————————————————————————————————————————————————

// Static notes and variation layers transform together.
d.sample("bd")
  .xox("x..x..x.")
  .notes(0, 10, 20)
  .var(0, 1, 2)
  .reverse()
  .fast(2)
  .push();

d.sample("bd").xox("x - - x - - x -").notes(0, 10, 20).var(0, 1, 2).push();

//  —————————————————————————————————————————————————————————————————————————————————

// Random shape transforms do not pre-resolve random values. Repeated bars
// get fresh deterministic results; reverse reverses the output within a bar.
d.sample("oh")
  .euclid([7, 8], 8)
  .var(d.rand().range(0, 4).rib(123))
  .stretch(2)
  .reverse()
  .push();

//  —————————————————————————————————————————————————————————————————————————————————

// Alternate direction applies consistently to every voice in a layered hit.
d.sample("oh")
  .xox("x...x...x...x...")
  .notes([0, 10, 20])
  .var([0, 0])
  .dir("alt")
  .clip(false)
  .push();

//  —————————————————————————————————————————————————————————————————————————————————

// Variation-owned timing and rests
d.sample("bd").var([0, null, 1, 2]).push();

//  —————————————————————————————————————————————————————————————————————————————————

// Random variation under fast, stretch, and reverse
d.sample("oh")
  .var(d.rand().range(-1, 5).steps(3).rib(123))
  .fast(2)
  .stretch(2)
  .reverse()
  .push();

//  —————————————————————————————————————————————————————————————————————————————————

// Alternate direction with a partial layered failure
d.loadSamples({
  bank: "dmx",
  samples: {
    bd: [
      "https://raw.githubusercontent.com/geikha/tidal-drum-machines/main/machines/OberheimDMX/oberheimdmx-oh/Hat%20Open.wav",
      "https://raw.githubusercontent.com/missing.wav",
    ],
  },
});

d.sample("bd").bank("dmx").hex(0xf).var([0, 1]).dir("alt").push();
