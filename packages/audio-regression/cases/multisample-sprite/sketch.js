d.loadSamples({
  bank: "acoustic",
  src: "/samples/harp-sprite.mp4",
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
  .start(0.01)
  .adsr(0, 0, 1, 1)
  .notes([0, 2, 4, 6, 7, 9, 11, 13], [7, 9, 11, 13, 14, 16, 18, 20])
  .push();
