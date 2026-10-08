d.loadSamples({
  bank: "acoustic",
  baseUrl: "/samples/",
  samples: {
    piano: {
      a2: ["045_A2v03.mp4", "045_A2v08.mp4"],
      a3: ["057_A3v03.mp4", "057_A3v08.mp4"],
      a4: ["069_A4v03.mp4", "069_A4v08.mp4"],
    },
  },
});

d.sample("piano")
  .var(d.rand().int().range(0, 2).steps(8))
  .bank("acoustic")
  .root("a2")
  .scale("min")
  .adsr(0, 0, 1, 1)
  .notes([0, 2, 4, 6, 7, 9, 11, 13], [7, 9, 11, 13, 14, 16, 18, 20])
  .push();
